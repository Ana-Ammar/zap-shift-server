const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 5165;

// Middlewire
app.use(express.json());
app.use(cors());

// Mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lh2xuij.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("zap shift server is running");
});

async function run() {
  try {
    await client.connect();

    // database collection create or connect
    const db = client.db("zap_shift");
    const parcelCollection = db.collection("parcels");

    // parcels-get api
    app.get("/parcels", async (req, res) => {
      try {
        const query = {};
        if (req.query.email) {
          query.senderEmail = req.query.email;
        }
        const parcels = await parcelCollection.find(query).toArray();
        res.send(parcels);
      } catch (error) {
        console.error("Error fetching parcels :", error);
        res.status(500).send({ message: "Failed to fetch parcels" });
      }
    });

    // parcels-get api by id
    app.get("/parcels/:id", async (req, res) => {
      try {
        const query = { _id: new ObjectId(req.params.id) };
        const result = await parcelCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error fetching parcel by id: ", error);
        res.status(500).send({ message: "Failed to fetch parcel by id" });
      }
    });

    // parcels-post api
    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;
        const result = await parcelCollection.insertOne(parcel);
        res.send(result);
      } catch (error) {
        console.error("Error creating parcel data:", error);
        res.status(500).send({ message: "Failed to create parcel" });
      }
    });

    // parcels-patch api
    app.patch("/parcels/:id", async (req, res) => {
      try {
        const query = { _id: new ObjectId(req.params.id) };
        const updateParcel = { $set: req.body };
        const result = await parcelCollection.updateOne(query, updateParcel);
        res.send(result);
      } catch (error) {
        console.error("Error update parcel data:", error);
        res.status(500).send({ message: "Failed to update parcel" });
      }
    });

    // parcels-delete api
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const query = { _id: new ObjectId(req.params.id) };
        const result = await parcelCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error delete parcel data:", error);
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    });

    // Api for payment, stripe-chechkout-session
    app.post("/payment-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.deliveryCharge) * 100;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "bdt",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.parcelName
                }
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.senderEmail,
          mode: "payment",
          metadata: {
            parcelId: paymentInfo.parcelId,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
        });
        res.send({ url: session.url });
      } catch (error) {
        console.error("Error for payment api:", error);
        res.status(500).send({ message: "Failed to payment done successfully" });
      }
    });


    

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`zap shift server is running on port: ${port}`);
});
