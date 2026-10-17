# crayZmundo Engine — one image, runs the API and the worker in a single process.
FROM python:3.12-slim

# ffmpeg does the cutting and rendering; the fonts are what captions are drawn in.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates gosu \
      fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/*

# Caption faces named by the style presets. Missing ones fall back, so a failed
# download never breaks a build.
RUN mkdir -p /usr/share/fonts/truetype/crayz && cd /usr/share/fonts/truetype/crayz && \
    for f in \
      "Montserrat/Montserrat-ExtraBold.ttf" \
      "Anton/Anton-Regular.ttf" \
      "PlayfairDisplay/PlayfairDisplay%5Bwght%5D.ttf" \
      "PermanentMarker/PermanentMarker-Regular.ttf" \
      "Bangers/Bangers-Regular.ttf" \
      "LuckiestGuy/LuckiestGuy-Regular.ttf" ; do \
      curl -fsSL -O "https://github.com/google/fonts/raw/main/ofl/$(echo $f | tr 'A-Z' 'a-z' | cut -d/ -f1)/$(basename $f)" || true ; \
    done && fc-cache -f

# The face detector OpenCV needs. Without it the Engine falls back to motion
# tracking, which works but is less precise on talking heads.
RUN mkdir -p /models && \
    curl -fsSL -o /models/face_detection_yunet.onnx \
      "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" || \
    echo "note: face model not fetched; motion tracking will be used"
ENV FACE_MODEL_PATH=/models/face_detection_yunet.onnx

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
      "fastapi>=0.115" "uvicorn[standard]>=0.30" "sqlmodel>=0.0.22" "pydantic-settings>=2.4" \
      "python-multipart>=0.0.9" "httpx>=0.27" \
      "faster-whisper>=1.0" "opencv-python-headless>=4.9" "numpy>=1.26" "yt-dlp>=2024.8.6" \
      "boto3>=1.34"

COPY app ./app
RUN useradd -m engine && chown -R engine /app

# A Fly volume mounts as root, so ownership is fixed at boot and the process
# then drops to an unprivileged user. gosu execs, so uvicorn stays PID 1 and
# receives SIGTERM directly — a shell wrapper would swallow it.
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV DATA_DIR=/data \
    HF_HOME=/data/models \
    SHUTDOWN_GRACE_S=120
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -fsS http://localhost:8080/v1/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# Graceful shutdown must outlast the worker's drain, which must outlast a render.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", \
     "--timeout-graceful-shutdown", "150"]
