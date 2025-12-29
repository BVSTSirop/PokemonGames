import unicodedata


def normalize_name(s: str) -> str:
    if not isinstance(s, str):
        s = str(s)
    s = s.strip()
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    # Map locale-specific letters
    s = s.replace('ß', 'ss')
    # Map gender symbols to letters to keep parity with English suggestions like "Nidoran M/F"
    s = s.replace('♂', 'm').replace('♀', 'f')
    # Remove any remaining non-alphanumeric characters
    s = ''.join(ch for ch in s if ('a' <= ch <= 'z') or ('0' <= ch <= '9'))
    return s
