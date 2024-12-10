const csvService = require('../services/csvService');
const linkedinService = require('../services/linkedinService');
const imageProcessingService = require('../services/imageProcessingService');
const logger = require('../utils/logger');
const path = require('path');
const AWS = require('aws-sdk');
const { downloadResults, uploadToDigitalOceanSpaces } = require('../utils/fileUtils');
const { App } = require('@slack/bolt');
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

            const startTime = new Date();
            let processedCount = 0;

            const slackAppInstance = new App({
                token: process.env.SLACK_BOT_TOKEN,
                signingSecret: process.env.SLACK_SIGNING_SECRET,
            });
            logger.info('Starting profile processing');

            // Set up a timer to send status updates every 5 minutes
            const statusInterval = setInterval(async () => {
                const remainingCount = totalProfiles - processedCount;
                try {
                    const percentage = ((processedCount / totalProfiles) * 100).toFixed(2);
                    await slackAppInstance.client.chat.postMessage({
                        channel: 'C0851R0H5K2',
                        text: `*Status Update* :hourglass_flowing_sand:\n\n*Processed Profiles:* \`${processedCount}\`\n*Remaining Profiles:* \`${remainingCount}\`\n*Completion:* \`${percentage}%\``,
                    });
                } catch (error) {
                    console.error('Error sending status update to Slack:', error);
                }
            }, 15 * 60 * 1000); // 15 minutes in milliseconds

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

                processedCount++;

                // Send progress update with newline
                const progress = (i + 1) / totalProfiles;
                logger.info(`Sending progress update: ${Math.round(progress * 100)}%`);
                res.write(JSON.stringify({ progress }) + '\n');
            }

            // Clear the interval once processing is complete
            clearInterval(statusInterval);

            // Send final results with newline
            logger.info('Sending final results');
            res.write(JSON.stringify({ results }) + '\n');
            res.end();

            // Generate CSV content
            const csvContent = await downloadResults(results, req.file.path);

            // Upload CSV to storage and get download link
            const downloadLink = await uploadToDigitalOceanSpaces(AWS, csvContent);

            console.log('Download link:', downloadLink);

            const completedAt = new Date();
            const timeTaken = `${((completedAt - startTime) / 1000).toFixed(2)} seconds`;

            // Format the start and completed times
            const formattedStartTime = new Intl.DateTimeFormat('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(startTime);

            const formattedCompletedAt = new Intl.DateTimeFormat('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(completedAt);

            try {
                await slackAppInstance.client.chat.postMessage({
                    channel: 'C0851R0H5K2',
                    text: `*Pixel Art Processing Complete!* :white_check_mark:\n\n*File Name:* \`${req.file.originalname}\`\n *Started At:* \`${formattedStartTime}\`\n *Completed At:* \`${formattedCompletedAt}\`\n *Processing Time:* \`${timeTaken}\`\n *Total Profiles Processed:* \`${totalProfiles}\`\n\n<${downloadLink}|⬇️ Download Results>`,
                });
            } catch (error) {
                console.error('Error sending message to Slack:', error);
            }
        } catch (error) {
            logger.error('Error in processProfiles:', error);

            // Send error report to Slack if the entire process fails
            try {
                await slackAppInstance.client.chat.postMessage({
                    channel: 'C0851R0H5K2',
                    text: `*Error in Profile Processing* :x:\n\n*Error:* \`${error.message}\``,
                });
            } catch (slackError) {
                console.error('Error sending error report to Slack:', slackError);
            }
            next(error);
        }
    }
}

module.exports = new ProcessController(); 