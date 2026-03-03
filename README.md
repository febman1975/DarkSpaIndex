# DarkSpaIndexHost

Simple Vercel static host that provides a downloadable `index.php` file.

## Usage

1. Replace `downloads/index.php` with your latest exported file from DarkSpaAntibot dashboard.
2. Deploy this folder to Vercel.
3. Download from: `https://<your-project>.vercel.app/downloads/index.php`
4. Upload into cPanel `public_html`.

## Notes

- `vercel.json` adds attachment headers so browser downloads `index.php`.
- Root page (`/`) shows a download button.
