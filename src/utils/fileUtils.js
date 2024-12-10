const fs = require('fs');
const csvParser = require('csv-parser');
const { parse } = require('json2csv');

async function downloadResults(results, existingCsvPath) {
    try {
        // Read and parse the existing CSV
        const existingData = await new Promise((resolve, reject) => {
            const rows = [];
            fs.createReadStream(existingCsvPath)
                .pipe(csvParser())
                .on('data', (row) => rows.push(row))
                .on('end', () => resolve(rows))
                .on('error', (error) => reject(error));
        });

        // Create a map of existing data for easy lookup
        const existingDataMap = existingData.reduce((acc, row) => {
            acc[row['linkedinUrl']] = row;
            return acc;
        }, {});

        // Update existing data with new fields
        results.forEach(result => {
            const existingRow = existingDataMap[result.url];
            if (existingRow) {
                existingRow['generatedArt1'] = result.pixelArtUrls && result.pixelArtUrls.length > 0 ? result.pixelArtUrls[0].replace(/^https:\/\/https:\/\//, 'https://') || '' : '';
                existingRow['generatedArt2'] = result.pixelArtUrls && result.pixelArtUrls.length > 1 ? result.pixelArtUrls[1].replace(/^https:\/\/https:\/\//, 'https://') || '' : '';
                existingRow['generatedArt3'] = result.pixelArtUrls && result.pixelArtUrls.length > 2 ? result.pixelArtUrls[2].replace(/^https:\/\/https:\/\//, 'https://') || '' : '';
                existingRow['generatedArt4'] = result.pixelArtUrls && result.pixelArtUrls.length > 3 ? result.pixelArtUrls[3].replace(/^https:\/\/https:\/\//, 'https://') || '' : '';
                existingRow['profilePicture'] = result.profilePicture || '';
            }
        });

        // Convert updated data back to CSV
        const csvContent = parse(existingData);

        return csvContent;
    } catch (error) {
        console.error('Error in downloadResults:', error);
        throw error;
    }
}

async function uploadToDigitalOceanSpaces(awsSdk, csvContent) {
    try {
        const spacesEndpoint = new awsSdk.Endpoint(process.env.DIGITAL_OCEAN_SPACES_ENDPOINT);
        const s3 = new awsSdk.S3({
            endpoint: spacesEndpoint,
            accessKeyId: process.env.DIGITAL_OCEAN_SPACES_ACCESS_KEY,
            secretAccessKey: process.env.DIGITAL_OCEAN_SPACES_SECRET,
            region: process.env.DIGITAL_OCEAN_SPACES_REGION
        });

        const fileName = `processed_profiles_${Date.now()}.csv`;

        const params = {
            Bucket: process.env.DIGITAL_OCEAN_SPACES_BUCKET,
            Key: `downloads/${fileName}`,
            Body: csvContent,
            ACL: 'public-read',
            ContentType: 'text/csv'
        };

        console.log('Uploading image to DigitalOcean Spaces:', params);

        console.log('Starting upload...');
        await s3.upload(params).promise();
        console.log('Image uploaded to DigitalOcean Spaces');

        // Return the URL of the uploaded image
        return `${process.env.DIGITAL_OCEAN_ORIGIN_ENDPOINT}/downloads/${fileName}`;
    } catch (error) {
        console.error('Error uploading image to DigitalOcean Spaces:', error);
        throw new Error(`Failed to upload image: ${error.message}`);
    }
}

module.exports = { downloadResults, uploadToDigitalOceanSpaces };