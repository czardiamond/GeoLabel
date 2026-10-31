from pathlib import Path


def test_backend_and_root_runtime_manifests_are_identical():
    root = Path(__file__).resolve().parents[1]

    def requirements(path):
        return [line.strip() for line in path.read_text().splitlines()
                if line.strip() and not line.lstrip().startswith('#')]

    assert requirements(root / 'requirements.txt') == requirements(root / 'backend/requirements.txt')
