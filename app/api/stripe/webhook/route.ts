import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveTierForSubscription } from "@/lib/stripe/tier";

const PRICE_TO_TIER: Record<string, "premium" | "business"> = {
  ...(process.env.STRIPE_PREMIUM_PRICE_ID ? { [process.env.STRIPE_PREMIUM_PRICE_ID]: "premium" } : {}),
  ...(process.env.STRIPE_BUSINESS_PRICE_ID ? { [process.env.STRIPE_BUSINESS_PRICE_ID]: "business" } : {}),
};

// Statuses that mean "actively paying" — anything else (canceled, unpaid,
// incomplete_expired, paused, ...) downgrades the account to free. This is a
// deliberately conservative default: better to under-grant access briefly
// than to leave a lapsed subscription on a paid tier indefinitely.
const ACTIVE_STATUSES: Stripe.Subscription.Status[] = ["active", "trialing"];

async function alreadyProcessed(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
): Promise<boolean> {
  const { data } = await supabase
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  return Boolean(data);
}

async function markProcessed(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
): Promise<void> {
  // Recorded only after successful handling — if we marked it up front and
  // the handler then threw, a Stripe retry (same event.id) would see
  // "already processed" and skip the update forever, silently dropping a
  // real subscription change. Insert failures here (rare id race) are safe
  // to ignore since the mutation itself already succeeded.
  await supabase.from("stripe_events").insert({ id: event.id, type: event.type });
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  supabase: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session
) {
  const userId = session.client_reference_id;
  if (!userId) return;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  const priceId = lineItems.data[0]?.price?.id;
  const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;
  if (!tier) return;

  await supabase
    .from("profiles")
    .update({ subscription_tier: tier, stripe_customer_id: session.customer as string })
    .eq("id", userId);
}

async function handleSubscriptionChange(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) return; // No matching account (or checkout.session.completed hasn't landed yet).

  const tier = resolveTierForSubscription({
    status: subscription.status,
    priceId: subscription.items.data[0]?.price?.id,
    activeStatuses: ACTIVE_STATUSES,
    priceToTier: PRICE_TO_TIER,
  });

  await supabase.from("profiles").update({ subscription_tier: tier }).eq("id", profile.id);
}

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature!, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : err}` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  if (await alreadyProcessed(supabase, event)) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, supabase, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(supabase, event.data.object as Stripe.Subscription);
        break;
    }
  } catch (err) {
    // Do NOT mark as processed — returning non-2xx makes Stripe retry, which
    // is what we want for a transient failure (e.g. a dropped DB connection).
    console.error(`[stripe webhook] failed to handle ${event.type} (${event.id}):`, err);
    return NextResponse.json({ error: "Handler failed, will retry" }, { status: 500 });
  }

  await markProcessed(supabase, event);
  return NextResponse.json({ received: true });
}
