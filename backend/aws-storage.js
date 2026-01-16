import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

/**
 * Upload a document to S3
 */
export async function uploadToS3(userId, fileBuffer, fileName, contentType) {
    const key = `documents/${userId}/${Date.now()}_${fileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType
    });

    try {
        await s3Client.send(command);
        return { success: true, key };
    } catch (err) {
        console.error("S3 Upload Error:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Get a signed URL for an S3 object
 */
export async function getS3SignedUrl(key) {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
    });

    try {
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return url;
    } catch (err) {
        console.error("S3 Signed URL Error:", err);
        return null;
    }
}

/**
 * Example RDS Configuration (PostgreSQL)
 * This is how you would connect to an AWS RDS instance.
 * You would use this instead of Supabase's built-in client for college/user data.
 */
/*
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    host: process.env.AWS_RDS_HOST,
    user: process.env.AWS_RDS_USER,
    password: process.env.AWS_RDS_PASSWORD,
    database: process.env.AWS_RDS_DATABASE,
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

export const db = pool;
*/
