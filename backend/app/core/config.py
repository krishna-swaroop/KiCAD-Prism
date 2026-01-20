"""
Application configuration with environment variable support.

Configuration can be set via:
1. Environment variables
2. .env file in the backend directory

See .env.example for available configuration options.
"""
from pydantic import Field
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # ===========================================
    # Google OAuth Configuration
    # ===========================================
    GOOGLE_CLIENT_ID: str = Field(
        default="",
        description="OAuth Client ID from Google Cloud Console. Leave empty to skip authentication."
    )
    
    # Comma-separated list of allowed user emails
    ALLOWED_USERS_STR: str = Field(
        default="",
        description="Comma-separated list of allowed user emails"
    )
    
    # ===========================================
    # Development Settings
    # ===========================================
    DEV_MODE: bool = Field(
        default=True,
        description="Enable development mode. When True and GOOGLE_CLIENT_ID is empty, bypasses authentication."
    )
    
    # ===========================================
    # Computed Properties
    # ===========================================
    @property
    def ALLOWED_USERS(self) -> List[str]:
        """Parse allowed emails from comma-separated string."""
        return [u.strip().lower() for u in self.ALLOWED_USERS_STR.split(",") if u.strip()]
    
    @property
    def AUTH_ENABLED(self) -> bool:
        """
        Authentication is enabled only if:
        1. A valid Google Client ID is configured, AND
        2. DEV_MODE is False
        
        This allows server hosts to deploy without authentication by either:
        - Not setting GOOGLE_CLIENT_ID, or
        - Setting DEV_MODE=True
        """
        return bool(self.GOOGLE_CLIENT_ID) and not self.DEV_MODE
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Allow extra fields to be ignored
        extra = "ignore"


# Global settings instance
settings = Settings()
