# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for git operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose backend port
EXPOSE 8000

# Run the application, binding to all interfaces for LAN access
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
