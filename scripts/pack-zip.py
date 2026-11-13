import os
import zipfile

def create_project_zip():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    public_dir = os.path.join(project_root, 'public')
    os.makedirs(public_dir, exist_ok=True)
    zip_path = os.path.join(public_dir, 'flex-and-flow-app.zip')

    ignored_dirs = {'node_modules', 'dist', '.git', '.cache', '__pycache__', '.vite'}
    ignored_extensions = {'.zip', '.tar', '.gz'}

    print(f"Creating zip archive at: {zip_path}")
    count = 0
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(project_root):
            # Prune ignored directories in-place
            dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith('.git')]
            
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in ignored_extensions:
                    continue
                
                full_path = os.path.join(root, file)
                # Compute relative path inside the zip file
                rel_path = os.path.relpath(full_path, project_root)
                
                # Exclude root zip if present
                if rel_path.endswith('flex-and-flow-app.zip'):
                    continue

                zip_file.write(full_path, arcname=rel_path)
                count += 1

    file_size_kb = os.path.getsize(zip_path) / 1024
    print(f"Successfully packaged {count} files ({file_size_kb:.1f} KB) into {zip_path}")

if __name__ == '__main__':
    create_project_zip()
