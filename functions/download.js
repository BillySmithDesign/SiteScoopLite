const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const sharp = require('sharp');

exports.handler = async function(event, context) {
  const url = event.queryStringParameters.url;

  if (!url) {
    return {
      statusCode: 400,
      body: 'URL parameter is required'
    };
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  // Remove tracking scripts
  await page.evaluate(() => {
    const trackingSelectors = [
      'script[src*="google-analytics.com"]',
      'script[src*="googletagmanager.com"]',
      'script[src*="facebook.net"]',
      'script[src*="ads"]',
      'iframe[src*="ads"]',
      'img[src*="ads"]',
      'script[src*="tracker"]',
      'iframe[src*="tracker"]',
      'img[src*="tracker"]'
    ];
    trackingSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Remove other tracking scripts by common patterns
    const scripts = document.getElementsByTagName('script');
    for (let script of scripts) {
      if (
        script.src.includes('track') ||
        script.src.includes('analytics') ||
        script.innerHTML.includes('track') ||
        script.innerHTML.includes('analytics')
      ) {
        script.remove();
      }
    }
  });

  // Save HTML
  const html = await page.content();
  const outputDir = path.join('/tmp', url.replace(/https?:\/\//, ''));
  if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);

  // Save CSS, JS, Images, etc.
  const elements = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.href);
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(script => script.src);
    const images = Array.from(document.querySelectorAll('img[src]')).map(img => img.src);
    return { links, scripts, images };
  });

  // Save CSS files
  for (const link of elements.links) {
    const css = await page.evaluate(url => fetch(url).then(res => res.text()), link);
    fs.writeFileSync(path.join(outputDir, path.basename(link)), css);
  }

  // Save JS files
  for (const script of elements.scripts) {
    const js = await page.evaluate(url => fetch(url).then(res => res.text()), script);
    fs.writeFileSync(path.join(outputDir, path.basename(script)), js);
  }

  // Save images and convert any SVG to PNG
  for (const image of elements.images) {
    const imagePath = path.join(outputDir, path.basename(image));
    const viewSource = await page.goto(image);
    fs.writeFileSync(imagePath, await viewSource.buffer());

    if (path.extname(imagePath) === '.svg') {
      const pngPath = imagePath.replace('.svg', '.png');
      await sharp(imagePath).png().toFile(pngPath);
      fs.unlinkSync(imagePath);
    }
  }

  await browser.close();

  // Create zip archive of the downloaded site
  const zipPath = `${outputDir}.zip`;
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  output.on('close', () => console.log(`Archive created successfully: ${zipPath}`));
  archive.pipe(output);
  archive.directory(outputDir, false);
  await archive.finalize();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${url.replace(/https?:\/\//, '')}.zip"`
    },
    body: fs.readFileSync(zipPath).toString('base64'),
    isBase64Encoded: true
  };
};
