"""Generate solid-colour PNG icons with a white dot (stdlib only)."""
import struct, zlib

def png(size, path):
    bg, fg = (79, 70, 229), (255, 255, 255)
    c, r = size / 2, size * 0.28
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row += bytes(fg if (x - c) ** 2 + (y - c) ** 2 <= r * r else bg)
        rows.append(bytes(row))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

for s in (180, 192, 512):
    png(s, f'icon-{s}.png')
