import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Price ID for the Pro Plan (should be in .env)
const PRO_PLAN_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;
const APP_URL = process.env.APP_URL || 'http://localhost:5500';

/**
 * Create a Stripe Checkout Session
 * POST /api/payments/create-checkout-session
 */
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { userId, email } = req.body;

        if (!userId || !email) {
            return res.status(400).json({ error: 'User ID and Email are required' });
        }

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer_email: email,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: PRO_PLAN_PRICE_ID,
                    quantity: 1,
                },
            ],
            mode: 'subscription', // or 'payment' for one-time
            success_url: `${APP_URL}/settings.html?session_id={CHECKOUT_SESSION_ID}&payment=success`,
            cancel_url: `${APP_URL}/settings.html?payment=cancel`,
            client_reference_id: userId, // Pass Supabase User ID to identify the user in the webhook
            metadata: {
                userId: userId
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create a Stripe Customer Portal Session
 * POST /api/payments/create-portal-session
 */
router.post('/create-portal-session', async (req, res) => {
    try {
        const { userId, email } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // 1. Try to get stripe_customer_id from Supabase first
        const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', userId)
            .single();

        let customerId = profile?.stripe_customer_id;

        // 2. Fallback: Find the customer in Stripe by email
        if (!customerId) {
            const customers = await stripe.customers.list({
                email: email,
                limit: 1
            });

            if (customers.data.length > 0) {
                customerId = customers.data[0].id;
            }
        }

        if (!customerId) {
            return res.status(404).json({ error: 'No Stripe customer found for this account. Please contact support or upgrade first.' });
        }

        // 3. Create Portal Session
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${APP_URL}/settings.html`,
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Error creating portal session:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Stripe Webhook to handle successful payments
 * POST /api/payments/webhook
 * IMPORTANT: Use express.raw() for this endpoint to verify signature
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId = session.customer;

        console.log(`Payment successful for user: ${userId}, Customer: ${customerId}`);

        // Update user's premium status in Supabase
        const { error } = await supabase
            .from('profiles')
            .update({
                is_premium: true,
                premium_since: new Date().toISOString(),
                stripe_customer_id: customerId
            })
            .eq('id', userId);

        if (error) {
            console.error('Error updating profile after payment:', error);
        } else {
            console.log(`User ${userId} upgraded to Premium!`);
        }
    }

    res.json({ received: true });
});

export default router;
