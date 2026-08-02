"""Generate opaque student access codes for STUDENT_TOKENS."""
import secrets
import sys

count = int(sys.argv[1]) if len(sys.argv) > 1 else 80
tokens = [secrets.token_urlsafe(9) for _ in range(count)]

print(f"Generated {count} access codes (one per line):\n")
print('\n'.join(tokens))

print("\nSTUDENT_TOKENS value for .env / Azure App Settings:\n")
print(','.join(tokens))
