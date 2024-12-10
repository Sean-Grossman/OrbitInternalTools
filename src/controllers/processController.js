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

            logger.info(`Processing ${totalProfiles} profiles sequentially`);

            for (let i = 0; i < profiles.length; i++) {
                const profile = profiles[i];
                logger.info(`Processing profile ${i + 1} of ${totalProfiles}`);

                try {
                    if (!await linkedinService.validateUrl(profile.linkedinUrl)) {
                        results.push({
                            url: profile.linkedinUrl,
                            status: 'failed',
                            error: 'Invalid LinkedIn URL format'
                        });
                        continue;
                    }

                    const profileData = await linkedinService.getProfileData(profile.linkedinUrl);

                    if (!profileData.profilePicture) {
                        results.push({
                            url: profile.linkedinUrl,
                            status: 'failed',
                            error: 'No profile picture URL available'
                        });
                        continue;
                    }

                    const processedImagePath = await imageProcessingService.processProfilePicture(
                        profileData.profilePicture,
                        profileData.fullName.replace(/\s+/g, '_'),
                        profile.hubspotId
                    );

                    results.push({
                        url: profile.linkedinUrl,
                        status: 'success',
                        originalImagePath: processedImagePath.originalPath,
                        pixelArtUrls: processedImagePath.pixelArtUrls,
                        profilePicture: profileData.profilePicture
                    });

                } catch (error) {
                    logger.error(`Error processing profile ${profile.linkedinUrl}:`, error);
                    results.push({
                        url: profile.linkedinUrl,
                        status: 'failed',
                        error: error.message
                    });
                }

                // Send progress update with newline
                const progress = (i + 1) / totalProfiles;
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