const csvService = require('../services/csvService');
const linkedinService = require('../services/linkedinService');
const imageProcessingService = require('../services/imageProcessingService');
const logger = require('../utils/logger');
const path = require('path');

/**
 * Controller managing the entire profile processing flow
 * Complete Flow:
 * 1. Receives CSV file with LinkedIn URLs
 * 2. For each URL:
 *    a. Validates LinkedIn URL format
 *    b. Fetches profile data from LinkedIn API
 *    c. Downloads profile picture
 *    d. Processes original image
 *    e. Sends to Discord for pixel art generation
 *    f. Downloads and saves generated pixel art
 * 3. Streams progress updates to client
 * 4. Returns final results with all processed images
 */
class ProcessController {
    async processProfiles(req, res, next) {
        try {
            if (!req.file) {
                throw new Error('No CSV file uploaded');
            }

            // Set up streaming response headers
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            logger.info('Starting profile processing');

            // Process CSV file
            const profiles = await csvService.processFile(req.file.path);
            const totalProfiles = profiles.length;
            const results = [];
            const batchSize = 5;

            logger.info(`Processing ${totalProfiles} profiles in batches of ${batchSize}`);

            for (let i = 0; i < profiles.length; i += batchSize) {
                const batch = profiles.slice(i, i + batchSize);
                logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}`);

                const batchPromises = batch.map(async (profile) => {
                    try {
                        if (!await linkedinService.validateUrl(profile.linkedinUrl)) {
                            return {
                                url: profile.linkedinUrl,
                                status: 'failed',
                                error: 'Invalid LinkedIn URL format'
                            };
                        }

                        const profileData = await linkedinService.getProfileData(profile.linkedinUrl);
                        
                        if (!profileData.profilePicture) {
                            return {
                                url: profile.linkedinUrl,
                                status: 'failed',
                                error: 'No profile picture URL available'
                            };
                        }

                        const processedImagePath = await imageProcessingService.processProfilePicture(
                            profileData.profilePicture,
                            profileData.fullName.replace(/\s+/g, '_')
                        );

                        return {
                            url: profile.linkedinUrl,
                            status: 'success',
                            originalImagePath: processedImagePath.originalPath,
                            // pixelArtPath: processedImagePath.pixelArtPath,
                            profilePicture: profileData.profilePicture
                        };

                    } catch (error) {
                        logger.error(`Error processing profile ${profile.linkedinUrl}:`, error);
                        return {
                            url: profile.linkedinUrl,
                            status: 'failed',
                            error: error.message
                        };
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // Send progress update with newline
                const progress = Math.min((i + batchSize) / totalProfiles, 1);
                logger.info(`Sending progress update: ${Math.round(progress * 100)}%`);
                res.write(JSON.stringify({ progress }) + '\n');
            }

            // Send final results with newline
            logger.info('Sending final results');
            res.write(JSON.stringify({ results }) + '\n');
            res.end();

        } catch (error) {
            logger.error('Error in processProfiles:', error);
            next(error);
        }
    }
}

module.exports = new ProcessController(); 