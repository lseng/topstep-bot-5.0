# Review

Review work done against a specification file and capture screenshots of the implemented functionality.

## Variables

adw_id: $ARGUMENT
spec_file: $ARGUMENT
agent_name: $ARGUMENT if provided, otherwise use 'reviewer'
review_image_dir: `<absolute path to codebase>/agents/<adw_id>/<agent_name>/review_img/`

## Instructions

### Phase 1: Setup and Context

1. Get the absolute path to the codebase using `pwd`
2. Create the review image directory: `mkdir -p <review_image_dir>`
3. Check current git branch: `git branch --show-current`
4. Run `git diff origin/main --stat` to see summary of changes
5. Read the spec file to understand what was implemented

### Phase 2: Prepare Application

1. Check if `.ports.env` exists and source it for FRONTEND_PORT, otherwise use 5173
2. Check if dev server is already running: `lsof -i :$PORT | grep LISTEN`
3. If not running, start it: `npm run dev &` and wait 5 seconds
4. Verify app is accessible: `curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT`

### Phase 3: Capture Screenshots (MANDATORY)

**IMPORTANT: You MUST capture 3-5 screenshots showing the implemented functionality.**

Use Playwright to capture screenshots. Create a temporary script and run it:

```bash
# Create screenshot script
cat > /tmp/capture_screenshots.mjs << 'SCRIPT'
import { chromium } from 'playwright';

const PORT = process.env.PORT || '5173';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './screenshots';

async function captureScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Screenshot 1: Landing/Home page
  await page.goto(`http://localhost:${PORT}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUTPUT_DIR}/01_landing_page.png`, fullPage: false });

  // Add more navigation and screenshots based on your needs
  // The agent should customize this based on the spec

  await browser.close();
  console.log('Screenshots captured successfully');
}

captureScreenshots().catch(console.error);
SCRIPT

# Run the script
PORT=$PORT OUTPUT_DIR="<review_image_dir>" npx playwright test --config=/dev/null /tmp/capture_screenshots.mjs 2>/dev/null || \
  node /tmp/capture_screenshots.mjs
```

**Alternative: Use Playwright's screenshot command directly:**
```bash
npx playwright screenshot http://localhost:$PORT "<review_image_dir>/01_main_view.png"
```

**CRITICAL: After capturing screenshots, verify they exist:**
```bash
ls -la <review_image_dir>/*.png
```

If no screenshots exist, the review has FAILED. Try again or report the error.

### Phase 4: Code Review

1. Review the git diff against the spec requirements
2. Check for:
   - Missing functionality
   - Implementation that doesn't match spec
   - Obvious bugs or issues
   - Accessibility concerns
3. Categorize any issues found:
   - `blocker`: Prevents release, harms user experience
   - `tech_debt`: Should be fixed later but doesn't block release
   - `skippable`: Minor issue, nice-to-have fix

### Phase 5: Output Results

**CRITICAL: Return ONLY valid JSON. No markdown, no explanations, just JSON.**

The JSON must include the `screenshots` array with absolute paths to the captured images.

## Report

Return results as JSON:

```json
{
  "success": true,
  "review_summary": "Brief 2-3 sentence summary of what was built and review outcome.",
  "review_issues": [
    {
      "review_issue_number": 1,
      "screenshot_path": "/absolute/path/to/issue_screenshot.png",
      "issue_description": "Description of the issue",
      "issue_resolution": "How to fix it",
      "issue_severity": "blocker|tech_debt|skippable"
    }
  ],
  "screenshots": [
    "/absolute/path/to/agents/adw_id/reviewer/review_img/01_landing_page.png",
    "/absolute/path/to/agents/adw_id/reviewer/review_img/02_feature_view.png"
  ]
}
```

**IMPORTANT:**
- `success` = true if NO blocker issues (can have tech_debt/skippable)
- `success` = false if ANY blocker issues exist
- `screenshots` array MUST contain at least 1 screenshot path
- All paths must be absolute paths
- Output ONLY the JSON object, nothing else
