import stripe from "stripe"
import Booking from '../models/Booking.js'
import Show from '../models/Show.js'
import { inngest } from '../inngest/index.js'

const markBookingPaid = async (bookingId) => {
    if (!bookingId) return;
    await Booking.findByIdAndUpdate(bookingId, {
        isPaid: true,
        paymentLink: "",
    });
};


export const stripeWebhooks = async (request, response)=>{
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        return response.status(500).send("Stripe webhook is not configured");
    }
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
    const sig = request.headers['stripe-signature'];
    if (!sig) {
        return response.status(400).send("Missing stripe-signature header");
    }

    let event;
    try{
        event=stripeInstance.webhooks.constructEvent(request.body,sig,process.env.STRIPE_WEBHOOK_SECRET)
    }catch (error){
        return response.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
         switch (event.type) {
          case "payment_intent.succeeded": {
    const paymentIntent = event.data.object;
    const sessionList = await stripeInstance.checkout.sessions.list({
        payment_intent: paymentIntent.id
    })
    if (!sessionList.data?.length) break;
    const session = sessionList.data[0];
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) break;
    const booking = await Booking.findByIdAndUpdate(bookingId, {
        isPaid: true,
        paymentLink: ""
    }, { new: true });
    const show = await Show.findById(booking.show);
    booking.bookedSeats.forEach((seat) => {
        show.occupiedSeats[seat] = booking.user;
    });
    show.markModified('occupiedSeats');
    await show.save();
    await inngest.send({
        name: "app/show.booked",
        data: { bookingId }
    });
    break;
}

            case "checkout.session.completed": {
                const session = event.data.object;
                const bookingId = session.metadata?.bookingId;
                await markBookingPaid(bookingId);
                break;
            }
                
         
            default:
console.log('Unhandled event type:' , event.type) 
        }
        response.json({received: true})
    } catch (err) {
        console.error("Webhook processing error:", err);
        response.status(500).send("Internal server Error");
        
    }
}
