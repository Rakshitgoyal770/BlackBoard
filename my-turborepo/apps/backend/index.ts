import express from 'express';
import { prisma } from '@repo/db';
import jwt from 'jsonwebtoken';
import cors from 'cors'
import { secretKey } from './config';
import middleware from './middleware';
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    res.send('Hello World!');
})

app.post('/SignUp', async (req, res) => {  
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.status(400).send('username and password are required');
    }

    let user = await prisma.user.findFirst({ where: { username } });
    if(user){
        return res.status(409).send('User already exists');    
    }

    user = await prisma.user.create({
        // @ts-ignore
        data: {
            username: username,
            password: password,
            name: username,
            email: `${username}@local.dev`
        }
    })

    res.status(201).send({ userId: user.id });

})

app.post('/Login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    const user = await prisma.user.findFirst({ where: { username, password } });

    if(!user){
        return res.status(401).send('Invalid username or password');
    }

    const token = jwt.sign({ UserId: user.id }, secretKey, { expiresIn: '1h' });
    res.send({ token });
})

app.post('/rooms', middleware, async (req, res) => {
    const userId = (req as any).userId;
    const { name } = req.body;

    if (!name) {
        return res.status(400).send('Room name is required');
    }

    try {
        const room = await prisma.room.create({
            data: {
                slug: name,
                adminId: userId
            }
        });

        res.status(201).json({
            roomId: room.id
        });

    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).send('Error creating room');
    }
});


app.listen(5000, ()=>{
    console.log('server is running on port 5000');
})