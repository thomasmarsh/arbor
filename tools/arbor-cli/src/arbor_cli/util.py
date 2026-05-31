from pathlib import Path

def get_monorepo_root(marker: str = ".git") -> Path:
    """
    Traverse up from the current file to find the monorepo root.
    Looks for the specified marker (default: '.git').
    """
    current_dir = Path(__file__).resolve().parent
    
    # Traverse upwards until we find the marker or hit the filesystem root
    while current_dir != current_dir.parent:
        if (current_dir / marker).exists():
            return current_dir
        current_dir = current_dir.parent
            
    raise FileNotFoundError(f"Could not find monorepo root containing '{marker}'")

# Example usage
REPO_ROOT = get_monorepo_root()
