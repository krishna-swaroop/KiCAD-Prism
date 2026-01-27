# Backend Dockerfile
# Using official KiCad image with ARM64 support
FROM kicad/kicad:9.0.0-arm64

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

USER root
WORKDIR /app

# Install Python and Git (KiCad image is based on Ubuntu/Debian)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application code
COPY . .

# Expose backend port
EXPOSE 8000

# Run the application
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
