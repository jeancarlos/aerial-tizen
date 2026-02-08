# Aerial Screensaver for Samsung Tizen TV

<p align="center">
  <img src="icon.png" width="256" alt="Aerial Screensaver Icon">
</p> 

---

Apple TV aerial screensaver videos playing natively on Samsung Smart TVs. Uses Samsung's AVPlay API for hardware-decoded HEVC 4K playback with smooth fade transitions between videos.

114 curated 4K aerial videos from Apple's CDN across four categories: Space (ISS orbital views), Sea (underwater wildlife), Landscape (national parks and glaciers), and Cityscape (world cities at golden hour). Each video includes a description overlay that appears as the video loads.

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

## WebView Simulator

The project includes a web-based simulator (`simulate.html`) that allows you to test the user interface, settings menu, and video transitions directly in your computer's browser without needing to deploy to the TV.

Since most browsers (except Safari) cannot natively play the Apple TV `.mov` (HEVC) videos, the simulator uses a mapping to H.264 versions of the videos for compatibility.

### How to use

1. Simply open `simulate.html` in your web browser (Chrome or Firefox recommended).
2. The simulator mocks the Samsung Tizen AVPlay API to provide a realistic experience.

### Simulator Keyboard Controls

| Key | Action |
|-----|--------|
| **Enter** | Open / Select in Settings Menu |
| **Space** | Play / Pause |
| **Right Arrow** | Next video |
| **Esc** | Close Settings Menu |

---

## Remote Control

| Key | Action |
|-----|--------|
| **Enter** | Open settings menu |
| **Play-Pause** | Pause / Resume |
| **Right Arrow** | Next video |
| **Channel Up / Down** | Next video |
| **Back** / **Stop** | Exit app |

### Inside the Settings Menu

| Key | Action |
|-----|--------|
| **Up / Down** | Navigate options |
| **Left / Right** | Change value |
| **Enter** | Toggle value |
| **Back** | Close menu and save |

---

## Settings Menu

Press **Enter** on the remote to open the settings menu. All settings are persisted to local storage and survive app restarts.

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| **Show Description** | On / Off | On | Toggle the video description overlay |
| **Description Timer** | 1 – 15s | 3s | How long the description stays visible after the video starts playing |
| **Video Order** | Shuffle / Sequential | Shuffle | Randomize or play videos in catalog order |
| **Category** | All / Space / Sea / Landscape / Cityscape | All | Filter videos by category |

### Video Categories

| Category | Videos | Content |
|----------|--------|---------|
| **Space** | ISS orbital views | Earth at night, auroras, continental passes, China |
| **Sea** | Underwater wildlife | Jellyfish, dolphins, sharks, coral reefs, whales |
| **Landscape** | Nature aerials | Grand Canyon, Yosemite, Iceland, Patagonia, Greenland |
| **Cityscape** | City aerials | Dubai, Hong Kong, London, Los Angeles, New York, San Francisco |

### Description Overlay

The description overlay replaces the old static "Aerial" loader text. When a new video starts:

1. The video's **label** and **description** appear at the bottom-left of the screen
2. The text stays visible during buffering (acting as a loader)
3. Once playback begins, it fades out after the configured timer (default 3s)
4. Opening the settings menu immediately hides the description

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

## License

[MIT](LICENSE)
