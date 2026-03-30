# How to deploy the Focus Guard privacy policy to GitHub Pages

## Step 1 — Create the GitHub repository
1. Go to https://github.com/new
2. Repository name: `focus-guard` (or `focus-guard-privacy`)
3. Set to **Public**
4. Do NOT initialize with README (we have one already)
5. Click **Create repository**

## Step 2 — Push this folder
Run these commands from inside the `github-pages/` folder:

```bash
git init
git add .
git commit -m "Add Focus Guard privacy policy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repo name.

## Step 3 — Enable GitHub Pages
1. Go to your new repository on GitHub
2. Click **Settings** tab
3. In the left sidebar, click **Pages**
4. Under **Source**, select **Deploy from a branch**
5. Branch: `main`, folder: `/ (root)`
6. Click **Save**

## Step 4 — Get your URL
After 1–2 minutes, your privacy policy will be live at:

```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

Use this URL as the Privacy Policy URL when submitting Focus Guard to the Chrome Web Store.

## Verification
Open the URL in a browser — you should see the Focus Guard privacy policy page.
