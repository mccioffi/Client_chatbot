FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Run the application
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--worker-class", "gthread", "--timeout", "120"]
