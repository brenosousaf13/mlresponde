from PIL import Image
import sys

try:
    img = Image.open(sys.argv[1])
    img = img.convert("RGBA")
    colors = img.getcolors(maxcolors=1000000)
    
    # Filter out transparent pixels
    solid_colors = [c for c in colors if c[1][3] > 0]
    
    # Sort by frequency
    solid_colors.sort(key=lambda x: x[0], reverse=True)
    
    print("Top 10 colors (Frequency, RGBA):")
    for count, color in solid_colors[:10]:
        hex_color = "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])
        print(f"{count:5d} pixels - {color} -> {hex_color}")
except Exception as e:
    print("Error:", e)
