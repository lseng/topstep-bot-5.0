# Install & Prime

## Read
.env.example (never read .env)

## Run
- Initialize a new git repository (if not already): `git init`
- Run `cp .env.example .env.local`
- Install dependencies with `npm install`

## Report
- Output the work you've just done in a concise bullet point list.
- Instruct the user to fill out `.env.local` based on `.env.example`.
- Mention: 'To setup your repository, be sure to update the remote repo url and push to a new repo:
  ```
  git remote add origin <your-new-repo-url>
  git push -u origin main
  ```'
