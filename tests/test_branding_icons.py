import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class BrandingIconsTest(unittest.TestCase):
    def test_icon_contains_valid_png_images_at_windows_sizes(self):
        data = (ROOT / 'assets/branding/senda.ico').read_bytes()
        reserved, kind, count = struct.unpack_from('<HHH', data)
        self.assertEqual((reserved, kind), (0, 1))
        sizes = []
        for i in range(count):
            width, height, _, _, planes, bits, length, offset = struct.unpack_from('<BBBBHHII', data, 6 + 16 * i)
            size = width or 256
            self.assertEqual(height or 256, size)
            self.assertEqual((planes, bits), (1, 32))
            image = data[offset:offset + length]
            self.assertEqual(len(image), length)
            self.assertEqual(image[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack_from('>II', image, 16), (size, size))
            sizes.append(size)
        self.assertEqual(sizes, [16, 20, 24, 32, 40, 48, 64, 128, 256])
        self.assertEqual(offset + length, len(data))

    def test_png_sizes_for_native_scale_factors(self):
        for size in [16, 20, 24, 32, 40, 48, 64, 128, 256]:
            data = (ROOT / f'assets/branding/png/{size}.png').read_bytes()
            self.assertEqual(struct.unpack_from('>II', data, 16), (size, size))

    def test_new_tab_uses_separate_monochrome_mask(self):
        for size in [16,32]:
            data=(ROOT / f'assets/branding/png/ntp-{size}.png').read_bytes()
            self.assertEqual(struct.unpack_from('>II',data,16),(size,size))
            self.assertNotEqual(data,(ROOT / f'assets/branding/png/{size}.png').read_bytes())

if __name__ == '__main__':
    unittest.main()
