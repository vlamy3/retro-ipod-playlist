# Retro iPod Playlist Player

A retro-style iPod web app with:
- Playlist switching
- Song add/create flows
- Real audio support (file/url)
- YouTube link playback support
- Optional synced lyrics (`[mm:ss] line`) on a separate lyrics screen
- Local persistence via `localStorage`

## Run locally

```bash
cd "/Users/thebiggestthelargest/Desktop/codex "
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Publish on GitHub Pages

This project is preconfigured with `.github/workflows/deploy-pages.yml`.

### 1. Initialize git and commit

```bash
cd "/Users/thebiggestthelargest/Desktop/codex "
git init
git add .
git commit -m "Initial retro iPod portfolio project"
git branch -M main
```

### 2. Create a new GitHub repo

Create an empty repo on GitHub (no README/license/gitignore from GitHub UI).

### 3. Connect remote and push

Replace `YOUR_USERNAME` and `YOUR_REPO`:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 4. Enable Pages

On GitHub:
1. Open your repo.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.

After the workflow completes, your site will be live at:
- `https://YOUR_USERNAME.github.io/YOUR_REPO/`

## Portfolio tips

- Put a short project description + screenshot in your portfolio case study.
- Mention key features: YouTube playback + synced lyrics + retro UI.
- Add the live URL and GitHub URL side-by-side.

## Notes

- Locally uploaded files (`blob:`) do not persist after refresh.
- URL/YouTube tracks and lyrics do persist via `localStorage`.
