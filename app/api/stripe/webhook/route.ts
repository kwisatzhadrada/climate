import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

const PRICE_TO_TIER: Record<string, "premium" | "business"> = {
  ...(process.env.STRIPE_PREMIUM_PRICE_ID ? { [process.env.STRIPE_PREMIUM_PRICE_ID]: "premium" } : {}),
  ...(process.env.STRIPE_BUSINESS_PRICE_ID ? { [process.env.STRIPE_BUSINESS_PRICE_ID]: "business" } : {}),
};

/** Handles checkout.session.completed to flip a user's subscription_tier. Wire this URL up in
 * the Stripe dashboard (or `stripe listen --forward-to`) as STRIPE_WEBHOOK_SECRET's endpoint. */
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const priceId = lineItems.data[0]?.price?.id;
    const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;

    if (userId && tier) {
      const supabase = createServiceClient();
      await supabase
        .from("profiles")
        .update({ subscription_tier: tier, stripe_customer_id: session.customer as string })
        .eq("id", userId);
    }
  }

  return NextResponse.json({ received: true });
}
