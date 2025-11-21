const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
          query.email = req.query.email;
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
    app.patch("parcels/:id", async (req, res) => {
      try {
        const query = { _id: new ObjectId(req.params.id) };
        const result = await parcelCollection.updateOne(query);
        res.send(result)
      } catch (error) {
        console.error("Error update parcel data:", error);
        res.status(500).send({ message: "Failed to update parcel" });
      }
    });

    // parcels-delete api
    app.delete("parcels/:id", async(req, res) => {
      try {
        const query = { _id: new ObjectId(req.params.id) };
        const result = await parcelCollection.deleteOne(query)
        res.send(result)
      } catch (error) {
         console.error("Error delete parcel data:", error);
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    })

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
