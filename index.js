const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 5165;
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middlewire
app.use(express.json());
app.use(cors());

// Firebase Token verify
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
  } catch (error) {}
  next();
};

// Generate tracking id for parcel
function generateTrackingId() {
  const prefix = "ZSC";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${date}-${random}`;
}

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
    const userCollection = db.collection("users");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const riderCollection = db.collection("riders");

    //add user to database
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        user.role = "user";
        user.createdAt = new Date();

        const existUser = await userCollection.findOne({ email: user.email });
        if (existUser) {
          return res.send({ message: "User already exist" });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error in adding user to database:", error);
        res.status(500).send({ message: "Failed to add user" });
      }
    });

    // get user data
    app.get("/users", async (req, res) => {
      try {
        const query = {};
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching data from userCollection: ", error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // get user role by email
    app.get("/user/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const user = await userCollection.findOne(query);
        res.send({role: user?.role || 'user'});
      } catch (error) {
        console.error("Error to fetch user role", error);
        res.status(500).send({ message: "Failed to fetch user role" });
      }
    });

    // update user role
    app.patch("/users/:id", async (req, res) => {
      try {
        const roleInfo = req.body;
        const query = { _id: new ObjectId(req.params.id) };
        const updateDoc = { $set: { role: roleInfo.role } };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error getting single user from users", error);
        res.status(500).send({ message: "Failed to fetch single user" });
      }
    });

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
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.parcelName,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.senderEmail,
          mode: "payment",
          metadata: {
            parcelId: paymentInfo.parcelId,
            parcelName: paymentInfo.parcelName,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
        });
        res.send({ url: session.url });
      } catch (error) {
        console.error("Error for payment api:", error);
        res
          .status(500)
          .send({ message: "Failed to payment done successfully" });
      }
    });

    // api for retrive stripes data after payment
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // prevent adding duplicate data into database
      const transectionId = session.payment_intent;
      const query = { transectionId: transectionId };
      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "Already Exist",
          transectionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();
      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            trackingId: trackingId,
          },
        };
        console.log(session);
        const result = await parcelCollection.updateOne(query, update);

        // Added to Payment collection afted payment
        const payment = {
          amount: session.amount_subtotal / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transectionId: session.payment_intent,
          paymentStatus: session.payment_status,
          trackingId: trackingId,
          paidAt: new Date(),
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          res.send({
            success: true,
            trackingId: trackingId,
            transectionId: session.payment_intent,
            modifyParcel: result,
            paymentInfo: resultPayment,
          });
        }
      }
    });

    // Payments get-api
    app.get("/payments", verifyFBToken, async (req, res) => {
      try {
        const query = {};
        if (req.query.email) {
          query.customerEmail = req.query.email;

          if (req.query.email !== req.decoded_email) {
            return res.status(403).send({ message: "Forbidden access" });
          }
        }
        const result = await paymentCollection
          .find(query)
          .sort({ paidAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error to fetch payment data:", error);
        res.status(500).send({ message: "Failed fetch data" });
      }
    });

    // Riders related API

    app.get("/riders", async (req, res) => {
      try {
        const query = {};
        if (req.query.status) {
          query.status = req.query.status;
        }
        const result = await riderCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error to fetch rider data:", error);
        res.status(500).send({ message: "Faild to fetch rider data" });
      }
    });

    app.post("/riders", async (req, res) => {
      try {
        const riderInfo = req.body;
        riderInfo.status = "pending";
        riderInfo.createdAt = new Date();
        const result = await riderCollection.insertOne(riderInfo);
        res.send(result);
      } catch (error) {
        console.error("Error to add rider data:", error);
        res.status(500).send({ message: "Faild to add rider data" });
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
