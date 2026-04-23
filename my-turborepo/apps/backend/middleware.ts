import { NextFunction } from "express";
import { secretKey } from "./config";
import jwt from 'jsonwebtoken';
import { Request, Response } from "express";

export default function middleware(req: Request, res: Response, next: NextFunction) {
    try{
        const authHeader = req.headers['authorization'] || null;
        const token = authHeader
            ? authHeader.startsWith('Bearer ')
                ? authHeader.split(' ')[1]
                : authHeader
            : null;

        if(!token){
            return res.status(401).send('Unauthorized');
        }
        const payload = jwt.verify(token, secretKey) as { userId?: string | number; UserId?: string | number };
        const userId = payload.userId ?? payload.UserId;

        if (!userId) {
            return res.status(401).send('Unauthorized');
        }

        (req as any).userId = String(userId);
        if (req.body && typeof req.body === 'object') {
            req.body.userId = String(userId);
        }
        next();
    }catch(e){
        return res.status(401).send('Unauthorized');
    }
}
