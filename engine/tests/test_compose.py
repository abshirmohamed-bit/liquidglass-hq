"""Render-level rules that are easy to get wrong and expensive to spot by eye."""
from __future__ import annotations

import pytest

from app.pipeline.caption import BY_ID, build_ass, group_lines
from pathlib import Path

from app.pipeline.compose import (
    ASPECTS,
    Render,
    Segment,
    _title_filter,
    remap_words,
    wrap_title,
)
from app.pipeline.frame import Track, crop_filter


def test_a_long_headline_wraps_instead_of_running_off_the_frame():
    lines = wrap_title("THE HONEST ANSWER IS THAT IT DEPENDS ON WHAT YOU MEASURE FIRST", 22)
    assert len(lines) == 2
    assert all(len(l) <= 23 for l in lines)
    assert not any(l.startswith(" ") for l in lines)


def test_title_shrinks_for_long_text():
    short = _title_filter({"text": "Short", "style": "bold_band"}, 1080, 1920)
    long = _title_filter({"text": "A headline with a great many words in it indeed", "style": "bold_band"}, 1080, 1920)
    size_of = lambda f: int(f.split("fontsize=")[1].split(":")[0])  # noqa: E731
    assert size_of(long) <= size_of(short)


@pytest.mark.parametrize("aspect,expected", list(ASPECTS.items()))
def test_every_aspect_has_even_dimensions(aspect, expected):
    r = Render(out=Path("out.mp4"), source=Path("in.mp4"), in_ms=0, out_ms=1000, aspect=aspect)
    w, h = r.size
    assert (w, h) == expected
    assert w % 2 == 0 and h % 2 == 0, "h264 needs even dimensions"


def test_crop_keeps_the_window_inside_a_landscape_source():
    track = Track("motion", 1920, 1080, [(0, 0.0), (1000, 1.0)], [])
    f, cmds = crop_filter(track, 1080, 1920, 2000)
    cw = int(f.split("=")[1].split(":")[0])
    xs = [float(line.split()[-1].rstrip(";")) for line in cmds.splitlines()]
    assert min(xs) >= 0
    assert max(xs) + cw <= 1920, "the crop never runs past the edge of the frame"


def test_captions_are_short_enough_to_read():
    words = [{"start_ms": i * 300, "end_ms": i * 300 + 280, "text": f"w{i}"} for i in range(20)]
    for line in group_lines(words):
        assert len(line.words) <= 4
        assert line.end_ms - line.start_ms <= 1800


def test_censored_words_are_masked_in_the_subtitle_file():
    words = [{"start_ms": 0, "end_ms": 500, "text": "damn"}, {"start_ms": 500, "end_ms": 900, "text": "fine"}]
    ass = build_ass(words, BY_ID["bold_white"], 1080, 1920, censored=["damn"])
    assert "d***" in ass and "damn" not in ass
    assert "fine" in ass


def test_a_clip_with_no_segments_is_rejected_rather_than_rendering_nothing():
    with pytest.raises(ValueError):
        Render(out=Path("out.mp4"), segments=[])
    with pytest.raises(ValueError):
        Render(out=Path("out.mp4"), source=Path("in.mp4"), in_ms=500, out_ms=500)


def test_segments_lay_end_to_end():
    r = Render(out=Path("out.mp4"), segments=[
        Segment(Path("a.mp4"), 1_000, 4_000),
        Segment(Path("b.mp4"), 10_000, 12_500),
    ])
    assert r.total_ms == 5_500


def test_captions_follow_their_segment_onto_the_stitched_timeline():
    a, b = Path("a.mp4"), Path("b.mp4")
    words = [
        {"start_ms": 0, "end_ms": 500, "text": "dropped", "source": str(a)},
        {"start_ms": 1_000, "end_ms": 1_400, "text": "first", "source": str(a)},
        {"start_ms": 10_200, "end_ms": 10_600, "text": "second", "source": str(b)},
        {"start_ms": 20_000, "end_ms": 20_400, "text": "also-dropped", "source": str(b)},
    ]
    out = remap_words(words, [Segment(a, 1_000, 4_000), Segment(b, 10_000, 12_500)])
    assert [w["text"] for w in out] == ["first", "second"], "words outside every segment are cut away"
    assert out[0]["start_ms"] == 0, "the first segment starts the clip"
    assert out[1]["start_ms"] == 3_200, "3000ms of segment one, then 200ms into segment two"


def test_a_word_straddling_a_cut_is_trimmed_to_the_cut():
    a = Path("a.mp4")
    out = remap_words([{"start_ms": 900, "end_ms": 1_500, "text": "straddles"}],
                      [Segment(a, 1_000, 2_000)])
    assert out[0]["start_ms"] == 0 and out[0]["end_ms"] == 500


def test_the_tracker_follows_a_moving_subject(tmp_path):
    """A silently empty track means every clip gets a centre crop. Catch that here."""
    import shutil
    import subprocess

    from app.pipeline.frame import track

    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    clip = tmp_path / "moving.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error",
        "-f", "lavfi", "-i", "color=c=0x101418:s=640x360:d=4:r=24",
        "-f", "lavfi", "-i", "color=c=0xE8E0D0:s=120x120:d=4:r=24",
        "-filter_complex", "[0:v][1:v]overlay=x='40+t*110':y=120",
        "-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p", "-y", str(clip),
    ], check=True)

    t = track(clip, mode="auto")
    assert len(t.samples) >= 3, "the tracker found nothing on an obviously moving subject"
    xs = [x for _, x in t.samples]
    assert xs[-1] > xs[0] + 0.05, "the track should follow the subject left to right"
