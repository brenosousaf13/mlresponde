const { Jimp } = require('jimp');

async function extract() {
  const image = await Jimp.read('Meli_Facil-removebg-preview.png');
  const colorCounts = {};
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const a = this.bitmap.data[idx + 3];
    
    if (a > 50) { // ignoring very transparent pixels
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      colorCounts[hex] = (colorCounts[hex] || 0) + 1;
    }
  });

  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  console.log('Top 10 Colors:');
  sorted.slice(0, 10).forEach(([color, count]) => {
    console.log(`${count} pixels: ${color}`);
  });
}

extract().catch(console.error);
