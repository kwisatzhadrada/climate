import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const PRICE_IDS: Record<string, string | undefined> = {
  premium: process.env.STRIPE_PREMIUM_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
};

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Payments aren't configured yet. Contact us to upgrade manually." },
      { status: 501 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { tier } = await request.json();
  const priceId = PRICE_IDS[tier];

  if (!priceId) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    success_url: `${appUrl}/dashboard?upgraded=1`,
    cancel_url: `${appUrl}/pricing`,
  });

  return NextResponse.json({ url: session.url });
}
