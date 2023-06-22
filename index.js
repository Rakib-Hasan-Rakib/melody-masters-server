const express = require('express')
const cors = require("cors")
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const app = express()
const port = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}



const uri = `mongodb+srv://${process.env.MELODY_MASTERS_USER}:${process.env.MELODY_MASTERS_PASS}@cluster0.umvg5wn.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db("melodyMastersDB").collection("users");
        const classCollection = client.db("melodyMastersDB").collection("classes")
        const selectedClassCollection = client.db("melodyMastersDB").collection('selectedClasses')
        const paymentCollection = client.db("melodyMastersDB").collection("payments")


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access' });
            }
            next();
        }

        //get users
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existedUser = await usersCollection.findOne(query);
            if (existedUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        // get admin and instractors
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })
        app.get('/users/instractor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ instractor: false })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instractor: user?.role === 'instractor' }
            res.send(result);
        })
        // create Admin and Instractors
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const madeAdmin = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, madeAdmin);
            res.send(result);
        })
        app.patch('/users/instractor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const madeInstractor = {
                $set: {
                    role: 'instractor'
                },
            };
            const result = await usersCollection.updateOne(filter, madeInstractor);
            res.send(result);
        })
        // get instractors
        app.get('/users/instractors', async (req, res) => {
            const query = { role: "instractor" }
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })


        // all classes

        app.post('/classes', async (req, res) => {
            const classDetail = req.body;
            const result = await classCollection.insertOne(classDetail);
            res.send(result);
        });
        app.get('/classes', async (req, res) => {
            const result = await classCollection.find().toArray()
            res.send(result);
        })
        app.patch('/classes/approved/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const approvedClass = {
                $set: {
                    status: 'approved'
                },
            };
            const result = await classCollection.updateOne(filter, approvedClass);
            res.send(result);
        })
        app.patch('/classes/denied/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const deniedClass = {
                $set: {
                    status: 'denied'
                },
            };
            const result = await classCollection.updateOne(filter, deniedClass);
            res.send(result);
        })
        app.get('/approvedClasses', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classCollection.find(query).toArray()
            res.send(result);
        })
        app.post('/selectedClasses', async (req, res) => {
            const selectedClass = req.body;
            const result = await selectedClassCollection.insertOne(selectedClass);
            res.send(result);
        });
        app.get('/selectedClasses/:email', async (req, res) => {
            const email = req.params.email;
            const query = { studentEmail: email }
            const result = await selectedClassCollection.find(query).toArray()
            res.send(result);
        })
        app.delete('/selectedClasses/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.deleteOne(query)
            res.send(result)
        })
        app.get('/myClasses/:email', async (req, res) => {
            const email = req.params.email;
            const query = { instractorEmail: email }
            const result = await classCollection.find(query).toArray()
            res.send(result);
        })


        // payment related api
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body
            const amount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({ amount: amount, currency: 'usd', payment_method_types: ['card'] })

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const id = payment.classId
            const insertedResult = await paymentCollection.insertOne(payment);
            const query = { _id: new ObjectId(id) }
            const deletedResult = await selectedClassCollection.deleteMany(query)
            res.send({ insertedResult, deletedResult })
        })
        
        //enrolled classes 
        app.get('/paidClasses/:email', async (req, res) => {
            const email = req.params.email;
            const query = { studentEmail: email }
            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray()
            res.send(result);
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Melody Masters server is running')
})

app.listen(port, () => {
    console.log(`Melody Masters running on port: ${port}`)
})