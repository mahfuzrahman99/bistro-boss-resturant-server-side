const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 2000;

// app.use(
//   cors({
//     origin: [
//       "http://localhost:5174",
//       "http://localhost:5173",
//       "https://coffee-making-server-clint.web.app",
//       "https://coffee-making-server-clint.web.app"
//     ],
//     // credentials: true,
//   })
// );

// app.use(cors())

const corsConfig = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5173",
    "https://coffee-making-server-clint.web.app",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};
app.use(cors(corsConfig));

app.use((req, res, next) => {
  // CORS headers
  res.header(
    "Access-Control-Allow-Origin",
    "https://coffee-making-server-clint.web.app",
    "http://localhost:5173",
    "http://localhost:5173"
  ); // restrict it to the required domain
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  // Set custom headers for CORS
  res.header(
    "Access-Control-Allow-Headers",
    "Content-type,Accept,X-Custom-Header"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return next();
});

app.use(cookieParser());
app.use(express.json());

// TOKEN VERIFY USING COOKIE
// const verifyToken = async (req, res, next) => {
//   const token = req.cookies?.token;
//   if (!token) {
//     return res.status(401).send({ message: "One Unauthorized access" });
//   }
//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//     if (err) {
//       console.log(err);
//       return res.status(401).send({ message: "Tow Unauthorized access" });
//     }
//     console.log("Value In The Token", decoded);
//     req.decoded = decoded;
//     next();
//   });
// };

// TOKEN VERIFY USING LOCALSTORAGE
const verifyToken = async (req, res, next) => {
  console.log("console.log from here", req.headers);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "One Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Tow Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.efkktro.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // AUTH RELATED APIS

    // post jwt using http only cookies
    // app.post("/jwt", async (req, res) => {
    //   const user = req.body;
    //   const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    //     expiresIn: "1h",
    //   });
    //   res
    //     .cookie("token", token, {
    //       httpOnly: true,
    //       secure: true,
    //       sameSite: "none",
    //     })
    //     .send({ success: true });
    // });

    // post jwt using local storage
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ token });
    });

    // app.get("/getCookie", async (req, res) => {
    //   const cookie = req.cookies.token;
    //   res.send({ cookie });
    // });

    // clear cookies after logOut user
    app.post("/logOut", async (req, res) => {
      const user = req.body;
      console.log("logOut user", user);
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // COLLECTIONS
    const orderMenusCollection = client
      .db("bistroBossDB")
      .collection("orderMenus");
    const reviewsCollection = client.db("bistroBossDB").collection("reviews");
    const cartsCollection = client.db("bistroBossDB").collection("carts");
    const usersCollection = client.db("bistroBossDB").collection("users");
    const paymentCollection = client.db("bistroBossDB").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // users related APIS
    // post method
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // get method
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    // get method for admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    // delete method
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    // patch method
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const patchDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(query, patchDoc);
        res.send(result);
      }
    );

    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // post menu items
    app.post("/orderMenus", async (req, res) => {
      const cartItem = req.body;
      const result = await orderMenusCollection.insertOne(cartItem);
      res.send(result);
    });
    // get all menus
    app.get("/orderMenus", async (req, res) => {
      const result = await orderMenusCollection.find().toArray();
      res.send(result);
    });
    // get with specific id
    app.get("/orderMenus/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orderMenusCollection.findOne(query);
      res.send(result);
    });
    // delete method
    app.delete(
      "/orderMenus/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await orderMenusCollection.deleteOne(query);
        res.send(result);
      }
    );
    app.patch("/orderMenus/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedInfo = req.body;
      const updatedDoc = {
        $set: {
          name: updatedInfo.name,
          recipe: updatedInfo.recipe,
          price: updatedInfo.price,
          category: updatedInfo.category,
        },
      };
      const result = await orderMenusCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // all carts items post in database
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result);
    });
    // add carts get all
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });
    // update product
    app.patch("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedInfo = req.body;
      const updatedDoc = {
        $set: {
          price: updatedInfo.price,
          quantity: updatedInfo.quantity,
        },
      };
      const result = await cartsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // post review
    app.post("/reviews", async (req, res) => {
      const reviewItem = req.body;
      const result = await reviewsCollection.insertOne(reviewItem);
      res.send(result);
    });
    // get all reviews
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    //+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // Payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // GET PAYMENT
    // get all payment
    app.get("/payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });
    // POST PAYMENT INFORMATION AND DELETE ALL OLDEST CART COLLECTIONS
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //  carefully delete each item from the cart
      console.log("payment info", payment);
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };

      const deleteResult = await cartsCollection.deleteMany(query);

      res.send({ paymentResult, deleteResult });
    });

    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    app.get("/admin_stats", async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const menus = await orderMenusCollection.estimatedDocumentCount();
      const carts = await cartsCollection.estimatedDocumentCount();

      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((sum, payment)=> sum + payment.price ,0)

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalREvenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalREvenue : 0;

      res.send({
        users,
        menus,
        carts,
        revenue,
        result,
      });
    });

    app.get("/order_stats", async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",
          },

          {
            $lookup: {
              from: "orderMenus",
              let: { menuItemId: { $toObjectId: "$menuItemIds" } },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$_id", "$$menuItemId"] },
                  },
                },
              ],
              as: "menuItems",
            },
          },

          // {
          //   $lookup: {
          //     from: "orderMenus",
          //     let: { menuItemIdVar: { $toObjectId: "$menuItemIds" } },
          //     pipeline: [
          //       {
          //         $match: {
          //           $expr: {
          //             $in: [
          //               "$_id",
          //               {
          //                 $cond: {
          //                   if: { $isArray: "$$menuItemIdVar" },
          //                   then: "$$menuItemIdVar",
          //                   else: ["$$menuItemIdVar"],
          //                 },
          //               },
          //             ],
          //           },
          //         },
          //       },
          //     ],
          //     as: "menuItems",
          //   },
          // },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: { $sum: 1 },
              revenue: { $sum: "$menuItems.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$revenue",
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
