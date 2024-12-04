const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

/**
 * Service for interacting with Discord's API for image generation
 * Flow:
 * 1. Receives image buffer from ImageProcessingService
 * 2. Uploads image to Discord channel
 * 3. Creates an "imagine" command interaction with the uploaded image
 * 4. Waits for Discord to process and generate pixel art
 * 5. Returns URL of generated pixel art image
 */
class ImagineApiService {
    constructor() {
        logger.info('Checking Discord configuration:', {
            hasApiUrl: !!process.env.DISCORD_API_URL,
            hasAppId: !!process.env.DISCORD_APPLICATION_ID,
            hasBotToken: !!process.env.DISCORD_BOT_TOKEN
        });

        const missingVars = [];
        if (!process.env.DISCORD_API_URL) missingVars.push('DISCORD_API_URL');
        if (!process.env.DISCORD_APPLICATION_ID) missingVars.push('DISCORD_APPLICATION_ID');
        if (!process.env.DISCORD_BOT_TOKEN) missingVars.push('DISCORD_BOT_TOKEN');

        if (missingVars.length > 0) {
            throw new Error(`Missing required Discord configuration: ${missingVars.join(', ')}`);
        }

        const baseURL = process.env.DISCORD_API_URL.endsWith('/') 
            ? process.env.DISCORD_API_URL 
            : `${process.env.DISCORD_API_URL}/`;

        this.api = axios.create({
            baseURL,
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000,
            httpsAgent: new (require('https').Agent)({  
                rejectUnauthorized: false
            })
        });

        this.applicationId = process.env.DISCORD_APPLICATION_ID;
        this.lastRequestTime = 0;
        this.minRequestInterval = 3000;

        if (!process.env.DISCORD_CHANNEL_ID) {
            throw new Error('Missing required Discord configuration: DISCORD_CHANNEL_ID');
        }
        
        this.channelId = process.env.DISCORD_CHANNEL_ID;
    }

    /**
     * Rate limiting mechanism to prevent Discord API throttling
     * Ensures minimum interval between requests
     */
    async waitForRateLimit() {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve => 
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();
    }

    /**
     * Main method for generating pixel art through Discord
     * @param {Buffer} imageBuffer - The original image buffer
     * @param {string} name - Name for the generated file
     * @returns {Promise<string>} URL of the generated pixel art
     */
    async generatePixelArt(imageBuffer, name) {
        try {
            await this.waitForRateLimit();
            logger.info(`Generating pixel art for ${name}`);
            
            // Log the image buffer details
            console.log('Image Buffer Details:', {
                size: imageBuffer.length,
                isBuffer: Buffer.isBuffer(imageBuffer),
                firstBytes: imageBuffer.slice(0, 20)
            });

            // First, upload the file to the channel using FormData
            const formData = new FormData();
            formData.append('content', 'Uploading image...');
            formData.append('file', imageBuffer, {
                filename: `${name}.png`,
                contentType: 'image/png'
            });

            console.log('FormData Payload:', {
                contentLength: formData.getLengthSync(),
                fileName: `${name}.png`
            });

            const uploadResponse = await this.api.post(`/channels/${this.channelId}/messages`, formData, {
                headers: formData.getHeaders()
            });

            console.log('Full Upload Response:', {
                status: uploadResponse.status,
                statusText: uploadResponse.statusText,
                headers: uploadResponse.headers,
                data: uploadResponse.data,
                attachments: uploadResponse.data?.attachments
            });

            if (!uploadResponse.data?.attachments?.[0]?.url) {
                console.error('Upload failed with response:', uploadResponse.data);
                throw new Error('Failed to upload image');
            }

            // Then, create the imagine command
            const interactionResponse = await this.api.post(`/interactions`, {
                type: 2,
                application_id: process.env.DISCORD_APPLICATION_ID,
                channel_id: this.channelId,
                data: {
                    name: 'imagine',
                    type: 1,
                    options: [{
                        type: 3,
                        name: 'prompt',
                        value: 'Create a full-body pixel-art sprite of a friend whose image is attached, designed as a character inspired by classic 1980s 2D Mario games. The character should be depicted from head to toe in a classic Mario running pose, with all limbs fully visible, including arms, legs, and feet. The design must include bright colors, a cartoonish, expressive face, overalls, a hat, and any unique traits from the provided photo (such as specific hair color or accessories). Position the character facing to the right, with arms and legs extended in a dynamic running motion, and wearing black sneakers. Ensure the entire body is fully visible in a retro 8-bit pixel art style, with no missing or cropped elements.'
                    }, {
                        type: 11,
                        name: 'image',
                        value: uploadResponse.data.attachments[0].url
                    }]
                }
            });

            if (!interactionResponse.data?.data?.attachments?.[0]?.url) {
                throw new Error('No image URL received from Discord API');
            }

            return interactionResponse.data.data.attachments[0].url;
        } catch (error) {
            logger.error('Error generating pixel art:', error.response?.data || error.message);
            throw new Error(`Failed to generate pixel art: ${error.message}`);
        }
    }
}

module.exports = new ImagineApiService(); 