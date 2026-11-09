import binascii
import hashlib
import importlib.util
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("snap", ROOT / "snap.py")
snap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snap)
PALETTE = ["202d3a", "6faba2", "af8759", "f1e1bc"]


def chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xffffffff)


def fixture(path):
    colors = [tuple(bytes.fromhex(color)) + (255,) for color in PALETTE]
    rows = []
    for y in range(64):
        row = bytearray()
        for x in range(64):
            color = (0, 0, 0, 0) if x < 8 or y < 8 else colors[((x // 8) + (y // 8)) % 4]
            if x == 20 and y == 20:
                color = (117, 174, 164, 255)
            row.extend(color)
        rows.append(b"\0" + row)
    header = struct.pack(">IIBBBBB", 64, 64, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b""))


def read_rgba(path):
    data, offset, compressed = path.read_bytes(), 8, bytearray()
    while offset < len(data):
        size = struct.unpack(">I", data[offset:offset+4])[0]
        kind, payload = data[offset+4:offset+8], data[offset+8:offset+8+size]
        if kind == b"IHDR":
            width, height, depth, color, *_ = struct.unpack(">IIBBBBB", payload)
            if depth != 8 or color != 6:
                raise AssertionError("Fixture expects upstream RGBA8 PNG output")
        elif kind == b"IDAT":
            compressed.extend(payload)
        offset += size + 12
    raw, stride, rows = zlib.decompress(compressed), width * 4, []
    for y in range(height):
        start = y * (stride + 1)
        mode, row = raw[start], bytearray(raw[start+1:start+1+stride])
        previous = rows[-1] if rows else bytes(stride)
        for x in range(stride):
            a, b = row[x-4] if x >= 4 else 0, previous[x]
            c = previous[x-4] if x >= 4 else 0
            if mode == 1: row[x] = (row[x] + a) & 255
            elif mode == 2: row[x] = (row[x] + b) & 255
            elif mode == 3: row[x] = (row[x] + ((a+b)//2)) & 255
            elif mode == 4:
                p = a+b-c
                distances = [abs(p-a), abs(p-b), abs(p-c)]
                row[x] = (row[x] + [a,b,c][distances.index(min(distances))]) & 255
            elif mode != 0: raise AssertionError("Unknown PNG filter")
        rows.append(row)
    return width, height, [tuple(row[x:x+4]) for row in rows for x in range(0, stride, 4)]


class PixelSnapperTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=ROOT / ".cache")
        self.folder = Path(self.temporary.name)
        self.source = self.folder / "own-fixture.png"
        fixture(self.source)

    def tearDown(self):
        self.temporary.cleanup()

    def test_pinned_source_is_unchanged(self):
        self.assertEqual(snap.verify_source()["upstream"]["commit"], "02f9315d73d3219274d17767b36d9a231a6b1f4b")

    def test_offline_grid_palette_alpha_and_determinism(self):
        original = hashlib.sha256(self.source.read_bytes()).hexdigest()
        first, second = self.folder / "first.png", self.folder / "second.png"
        for output in [first, second]:
            snap.process(self.source, output, 4, 8, ",".join(PALETTE))
        width, height, pixels = read_rgba(first)
        self.assertEqual((width, height), (9, 9))
        self.assertTrue(any(p[3] == 0 for p in pixels))
        self.assertTrue(any(p[3] == 255 for p in pixels))
        allowed = {tuple(bytes.fromhex(value)) for value in PALETTE}
        self.assertTrue(all(p[:3] in allowed for p in pixels if p[3]))
        self.assertEqual(first.read_bytes(), second.read_bytes())
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), original)

    def test_batch_directory(self):
        inputs = self.folder / "inputs"
        inputs.mkdir()
        for name in ["one.png", "two.png"]: fixture(inputs / name)
        output = self.folder / "batch"
        snap.process(inputs, output, 4, 8, ",".join(PALETTE))
        self.assertEqual(sorted(p.name for p in output.iterdir()), ["one.png", "two.png"])
        self.assertEqual(read_rgba(output / "one.png")[:2], (9, 9))

    def test_never_overwrites_source_or_existing_output(self):
        for output in [self.source, self.folder]:
            with self.assertRaisesRegex(ValueError, "new file"):
                snap.process(self.source, output)

    def test_runtime_outputs_require_separate_review(self):
        output = snap.PROJECT / "client-godot" / "resources" / "art" / "must-not-be-written.png"
        with self.assertRaisesRegex(ValueError, "review output"):
            snap.process(self.source, output)
        self.assertFalse(output.exists())

    def test_batch_cannot_write_inside_input(self):
        with self.assertRaisesRegex(ValueError, "outside the input"):
            snap.process(self.folder, self.folder / "child")

    def test_palette_validation(self):
        self.assertEqual(len(snap.palette_value("jala-muara").split(",")), 16)
        with self.assertRaises(ValueError): snap.palette_value("#bad")

    def test_upstream_rejects_invalid_grid(self):
        with self.assertRaises(subprocess.CalledProcessError):
            snap.process(self.source, self.folder / "bad.png", 4, 1000)


if __name__ == "__main__":
    unittest.main()
