# Aerial Screensaver for Samsung Tizen TV

Apple TV aerial screensaver videos playing natively on Samsung Smart TVs. Uses Samsung's AVPlay API for hardware-decoded HEVC 4K playback with smooth fade transitions between videos.

30 curated aerial videos from Apple's CDN featuring cities, landscapes, space, and underwater scenes.

---

## Requirements

- Samsung Smart TV with Tizen 6.0+ (2021 models or newer)
- [Tizen Studio CLI](https://developer.tizen.org/development/tizen-studio/download)
- [Samsung Developer Account](https://developer.samsung.com/)
- PC on the same network as the TV

## Setup

### 1. Enable Developer Mode on TV

1. Open the **Apps** panel on your TV
2. Press `1` `2` `3` `4` `5` on the remote — a dialog appears
3. Toggle **Developer Mode** ON
4. Enter your PC's IP address
5. Restart the TV

### 2. Connect via SDB

```bash
sdb connect <TV_IP>:26101
sdb devices  # should show your TV
```

### 3. Get your TV's DUID

```bash
sdb shell 0 getduid
```

Save this value — you'll need it for the Samsung distributor certificate.

### 4. Create Certificates

You need two certificates: an **author certificate** and a **Samsung distributor certificate**.

#### Author Certificate

```bash
tizen certificate -a aerial -p 1234 -c BR -s SC -ct Florianopolis -o YourName -n aerial
```

#### Samsung Distributor Certificate

This requires your Samsung Developer account and the TV's DUID. Use the [Samsung Certificate Extension](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) in Tizen Studio IDE, or generate it via the Samsung API with your DUID.

The certificate files should be placed in a directory (e.g. `keystore/distributor/`):
- `distributor.p12` — PKCS12 keystore
- Intermediate CA cert from Samsung

> **Note**: If using OpenSSL 3.x, export the `.p12` with the `-legacy` flag for Java compatibility.

### 5. Create Security Profile

```bash
tizen security-profiles add \
  -n MyProfile \
  -a /path/to/author/aerial.p12 -p 1234 \
  -d /path/to/distributor/distributor.p12 -dp 1234 \
  -dc /path/to/distributor/ca/vd_tizen_dev_public2.crt

tizen cli-config "profiles.path=/path/to/profile/profiles.xml"
```

### 6. Build and Install

```bash
# Package
tizen package -t wgt -s MyProfile -- /path/to/aerial-tizen

# Copy without spaces in filename
cp "Aerial Screensaver.wgt" /tmp/aerial.wgt

# Install
tizen install -n aerial.wgt -t <TV_NAME> -- /tmp

# Run
tizen run -p AerialScr0.AerialScreensaver -t <TV_NAME>
```

> **Important**: The `.wgt` filename must not contain spaces, or the install will fail silently.

## Remote Control

| Key | Action |
|-----|--------|
| Enter / Play-Pause | Pause / Resume |
| Right Arrow | Next video |
| Channel Up / Down | Next video |
| Back / Stop | Exit app |

## License

[MIT](LICENSE)
