import Show from "../models/Show.js"
import Booking from "../models/Booking.js"
import stripe from 'stripe'
//function to check availability of selected seats foe a movie 

const checkSeatsAvailability=async(showId,selectedSeats)=>{
    try{
        const showData=await Show.findById(showId)
        if(!showData) return false;

        const occupiedSeats = showData.occupiedSeats;

        const isAnySeatTaken = selectedSeats.some(seat=>occupiedSeats[seat]);

        return !isAnySeatTaken;
    } catch (error){
        console.log(error.message);
        return false;
        
    }
}

export const createBooking=async (req, res)=>{
    try{
           const {userId}=req.auth();
           const { origin } = req.headers;
           if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
           }
           const { showId, selectedSeats } = req.body;
           if (!showId || !Array.isArray(selectedSeats) || selectedSeats.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid booking payload" });
           }
           if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(500).json({ success: false, message: "Stripe is not configured" });
           }
           const clientOrigin = origin || process.env.CLIENT_URL || "http://localhost:5173";

           //chech is the seat is available for the selected show 
           const isAvailable=await checkSeatsAvailability(showId, selectedSeats)

           if(!isAvailable){
            return res.json({success: false, message: "selected seats are not available."})
               
        }
       //get the show details
        const showData=await Show.findById(showId).populate('movie');
        if (!showData) {
            return res.json({ success: false, message: "Show not found" });
        }

        //create a new booking 
        const booking = await Booking.create({
            user: userId,
            show :showId,
            amount: showData.showPrice*selectedSeats.length,
            bookedSeats:selectedSeats
        })

        //stripe gateway initilize
        const stripeInstance=new stripe(process.env.STRIPE_SECRET_KEY)
        //creating line items to for stripe
        const line_items=[{
            price_data:{
             currency:'usd',
             product_data:{
                name:showData.movie.title
             },
             unit_amount:Math.floor(booking.amount)*100
            },
            quantity:1
       }]

       const session=await stripeInstance.checkout.sessions.create({
        success_url: `${clientOrigin}/loading/my-bookings`,
        cancel_url: `${clientOrigin}/my-bookings`,
        line_items: line_items,
        mode:'payment',
        metadata:{
            bookingId: booking._id.toString()
        },
        expires_at: Math.floor(Date.now()/1000)+30*60,
       })

       booking.paymentLink=session.url
       await booking.save()

       



        res.json({success: true, url: session.url})

    }catch (error){
         console.log(error.message);
         res.json({success: false,message:error.message});
         
    }
}

export const getOccupiedSeats=async (req,res) =>{
     try{

        const {showId}=req.params;
        const showData=await Show.findById(showId)

        const occupiedSeats=Object.keys(showData.occupiedSeats)

        res.json({success:true,occupiedSeats})

     }catch (error){
        console.log(error.message);
        res.json({success:false, message: error.message})
        
     }
}
