# Aerial Screensaver for Samsung Tizen TV

Apple TV aerial screensaver videos playing natively on Samsung Smart TVs. Uses Samsung's AVPlay API for hardware-decoded HEVC 4K playback with smooth fade transitions between videos.

30 curated aerial videos from Apple's CDN featuring cities, landscapes, space, and underwater scenes.

## Thanks

Inspired by [xscreensaver-aerial](https://github.com/graysky2/xscreensaver-aerial) by graysky2.

---

## Requirements

- Samsung Smart TV with **Tizen 6.0+** (2021 models or newer)
- Linux, macOS, or Windows PC on the **same network** as the TV
- Java 11+ (JDK)
- [Tizen Studio CLI](https://developer.tizen.org/development/tizen-studio/download)
- [Samsung Developer Account](https://developer.samsung.com/) (free)

---

## Installation Guide

### Step 1 — Install Tizen Studio CLI

Download and install the [Tizen Studio CLI](https://developer.tizen.org/development/tizen-studio/download). After installation, make sure `tizen` and `sdb` are in your PATH:

```bash
export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"
```

> **Fedora/RHEL**: If the installer complains about missing dependencies, you can patch it to skip the check. The CLI works fine without the GUI dependencies.

> **OpenSSL 3.x**: If you get PKCS12 errors later, you'll need the `-legacy` flag when exporting `.p12` files.

### Step 2 — Enable Developer Mode on the TV

1. Turn on your Samsung TV
2. Open the **Apps** panel
3. Press `1` `2` `3` `4` `5` on the remote — a developer settings dialog appears
4. Toggle **Developer Mode** to **ON**
5. Enter your **PC's local IP address** (e.g. `192.168.1.143`)
6. **Restart the TV** (power off and on)

> Your PC and TV must be on the same subnet. Check with `ip addr` (Linux) or `ipconfig` (Windows).

### Step 3 — Connect to the TV

```bash
sdb connect <TV_IP>:26101
```

Verify the connection:

```bash
sdb devices
```

Expected output:

```
List of devices attached
192.168.1.160:26101    device    QN55Q70AAGXZD
```

If the connection fails:
- Make sure Developer Mode is ON and the correct PC IP is set
- Restart the TV after changing settings
- Check that both devices are on the same network/subnet

### Step 4 — Get your TV's DUID

The DUID (Device Unique ID) ties the Samsung certificate to your specific TV:

```bash
sdb shell 0 getduid
```

Save this value — you'll need it in Step 5.

### Step 5 — Create Certificates

Samsung TVs require **two certificates** to install apps: an author certificate and a Samsung distributor certificate.

#### 5a. Author Certificate

Generate a self-signed author certificate:

```bash
tizen certificate \
  -a aerial \
  -p <PASSWORD> \
  -c <COUNTRY_CODE> \
  -s <STATE> \
  -ct <CITY> \
  -o <YOUR_NAME> \
  -n aerial
```

Example:

```bash
tizen certificate -a aerial -p 1234 -c US -s California -ct "San Francisco" -o "John Doe" -n aerial
```

This creates `aerial.p12` in `~/tizen-studio-data/keystore/author/`.

#### 5b. Samsung Distributor Certificate

This is the trickiest part. You need a certificate from Samsung that includes your TV's DUID.

**Option A — Tizen Studio IDE (recommended for beginners)**

1. Install the full [Tizen Studio IDE](https://developer.tizen.org/development/tizen-studio/download) (not just CLI)
2. Install the **Samsung Certificate Extension** via Package Manager
3. Go to **Tools > Certificate Manager**
4. Create a new Samsung certificate profile
5. Log in with your Samsung Developer account
6. Enter your TV's DUID when prompted
7. The IDE generates the distributor certificate automatically

**Option B — Samsung API (advanced)**

Use the Samsung Certificate API at `https://svdca.samsungqbe.com/apis/v3/distributors` with:
- Samsung account OAuth token
- A CSR containing your DUID as a SAN URI (`URN:tizen:deviceid=<YOUR_DUID>`)
- Platform: `VD` (for TV)
- Privilege level: `Public`

The certificate files should be placed in a directory structure like:

```
keystore/distributor/MyProfile/
  distributor.p12        # PKCS12 keystore with private key + cert chain
  ca/res/ca/
    vd_tizen_dev_public2.crt  # Samsung intermediate CA cert
```

> **OpenSSL 3.x users**: If you get "Invalid password" errors during packaging, re-export the `.p12` with legacy encryption:
> ```bash
> openssl pkcs12 -in distributor.p12 -legacy -out /tmp/combined.pem -passin pass:<PASSWORD> -nodes
> openssl pkcs12 -export -in /tmp/combined.pem -out distributor.p12 -legacy -passout pass:<PASSWORD>
> rm /tmp/combined.pem
> ```

### Step 6 — Create Security Profile

Link both certificates into a security profile:

```bash
tizen security-profiles add \
  -n AerialProfile \
  -a ~/tizen-studio-data/keystore/author/aerial.p12 \
  -p <AUTHOR_PASSWORD> \
  -d /path/to/distributor/distributor.p12 \
  -dp <DISTRIBUTOR_PASSWORD> \
  -dc /path/to/distributor/ca/res/ca/vd_tizen_dev_public2.crt

tizen cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
```

### Step 7 — Run Setup Wizard

Clone this repo and run the setup wizard to configure your environment:

```bash
git clone https://github.com/jeancarlos/aerial-tizen.git
cd aerial-tizen
./setup.sh
```

The wizard will:
1. Ask for your Tizen Studio installation path
2. Connect to your TV via SDB
3. Auto-detect the TV's DUID
4. Save everything to a `.env` file

If you already have a `.env`, the wizard shows saved values as defaults — just press Enter to keep them.

### Step 8 — Deploy to TV

```bash
./deploy.sh
```

This packages the app, installs it on your TV, and launches it.

> **Important**: The `.wgt` filename must not contain spaces, or the install will fail silently. The deploy script handles this automatically.

---

## Remote Control

| Key | Action |
|-----|--------|
| **Enter** / **Play-Pause** | Pause / Resume |
| **Right Arrow** | Next video |
| **Channel Up / Down** | Next video |
| **Back** / **Stop** | Exit app |

---

## Troubleshooting

### "Failed to install Tizen application" with no details

- The `.wgt` filename has spaces — the deploy script avoids this, but if packaging manually, rename the file
- Certificates might be invalid — make sure the distributor cert contains your TV's DUID
- Try uninstalling first: `tizen uninstall -p AerialScr0.AerialScreensaver -t <TV_NAME>`

### "Invalid password" during packaging

OpenSSL 3.x generates PKCS12 files with modern encryption that Java can't read. Re-export with `-legacy` flag (see Step 5b).

### SDB connection refused

1. Confirm Developer Mode is ON (Apps > press 12345)
2. Verify the **Host PC IP** matches your PC's actual IP
3. Restart the TV after any settings change
4. Make sure PC and TV are on the same subnet

### App icon not updating after reinstall

Tizen caches icons. Uninstall the app completely and reinstall:

```bash
tizen uninstall -p AerialScr0.AerialScreensaver -t <TV_NAME>
./deploy.sh
```

### Videos not playing

- The TV needs internet access to stream from Apple's CDN
- HEVC decoding is handled natively by AVPlay — no codec installation needed
- If a video fails, the app automatically skips to the next one

---

## Project Structure

```
aerial-tizen/
  config.xml      # Tizen app manifest (privileges, app ID, version)
  index.html      # Entry point with AVPlay object element
  js/main.js      # Video player logic, remote control handling
  css/style.css   # Fullscreen layout, loader and fade transitions
  icon.png        # App icon (displayed in TV app list)
  setup.sh        # Interactive setup wizard (generates .env)
  deploy.sh       # One-command build + install + launch
  .env            # Local config (git-ignored)
```

## License

[MIT](LICENSE)
