import express from 'express';
import { prisma } from '@repo/db';
import jwt from 'jsonwebtoken';
import cors from 'cors'
import { secretKey } from './config';
import middleware from './middleware';
const app = express();
const PORT = Number(process.env.PORT ?? 5000);
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? '*';

app.use(cors({
    origin: ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    res.send('Hello World!');
})

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
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

app.get('/rooms/:roomId', middleware, async (req, res) => {
    const roomId = Number(req.params.roomId);

    if (!Number.isInteger(roomId)) {
        return res.status(400).send('Invalid room id');
    }

    const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
            admin: {
                select: {
                    id: true,
                    username: true,
                    name: true
                }
            }
        }
    });

    if (!room) {
        return res.status(404).send('Room not found');
    }

    res.json({
        id: room.id,
        slug: room.slug,
        createdAt: room.createdAt,
        admin: room.admin
    });
});

app.get('/rooms/:roomId/messages', middleware, async (req, res) => {
    const roomId = Number(req.params.roomId);

    if (!Number.isInteger(roomId)) {
        return res.status(400).send('Invalid room id');
    }

    const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { id: true }
    });

    if (!room) {
        return res.status(404).send('Room not found');
    }

    const messages = await prisma.chat.findMany({
        where: { roomId },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    name: true
                }
            }
        }
    });

    res.json(
        messages.map((chat) => ({
            id: chat.id,
            message: chat.message,
            createdAt: chat.createdAt,
            roomId: chat.roomId,
            userId: chat.userId,
            username: chat.user.username,
            name: chat.user.name
        }))
    );
});

app.listen(PORT, '0.0.0.0', ()=>{
    console.log(`server is running on port ${PORT}`);
})
