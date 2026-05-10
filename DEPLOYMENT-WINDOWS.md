# EliteMek ERP Windows Deployment

## Prerequisites

- Node.js 20 or newer
- Python 3.10 or newer
- PostgreSQL running locally or on a reachable server
- pnpm installed globally with `npm install -g pnpm`, or Corepack enabled with `corepack enable`

## Setup On A New System

1. Copy the full project folder to the new machine.
2. Copy `.env.example` to `.env`.
3. Edit `.env` and set `DATABASE_URL` to your PostgreSQL database.
4. Run `start.bat`.

The launcher will:

- install workspace dependencies with pnpm when missing
- install backend dependencies
- create required local folders
- check PostgreSQL reachability
- run database schema push when `RUN_SCHEMA_PUSH=1`
- seed demo data only when `SEED_DATABASE=1`
- start backend API
- start frontend dashboard

Default login after seeding demo data:

- Email: `admin@elitemek.com`
- Password: `admin123`

## Common Options

- Set `SEED_DATABASE=1` only when you want demo/sample data created or reset.
- Set `OPEN_BROWSER=0` if the launcher should not open the browser.
- Set `CHECK_DATABASE=0` only for troubleshooting when PostgreSQL is temporarily unreachable.

## Payslip Automation Notes

Payroll now supports a standard payslip PDF download from the Payroll page. Configure WhatsApp/payslip preferences in `Settings > Payslip Automator`.

### OpenWA WhatsApp Integration

The system now uses [OpenWA](https://github.com/rmyndharis/OpenWA) for WhatsApp integration, which provides a self-hosted WhatsApp API gateway.

#### Setup OpenWA

1. **Install OpenWA** (run separately from the ERP system):
   ```bash
   git clone https://github.com/rmyndharis/OpenWA.git
   cd OpenWA
   npm install
   npm run dev
   ```

2. **Access OpenWA Dashboard**: Open http://localhost:2886
3. **Create a WhatsApp Session**:
   - Go to Sessions in the dashboard
   - Create a new session
   - Scan the QR code with WhatsApp on your phone
   - Note the Session ID

4. **Configure API Key**: Generate an API key in the dashboard

#### Configure ERP Settings

In the ERP system `Settings > Payslip Automator`:
- **OpenWA API URL**: `http://localhost:2785/api` (default)
- **OpenWA API Key**: Your generated API key
- **OpenWA Session ID**: The session ID from step 3
- **Sender WhatsApp Number**: The phone number that scanned the QR code

#### Usage

- Enable "Enable payslip automation" in settings
- The system will send PDF payslips directly via WhatsApp when clicking "Send WhatsApp" in payroll
- Messages include the configured template with employee details and attached PDF

#### Production Deployment

For production, deploy OpenWA separately:
```bash
docker compose -f docker-compose.yml up -d
```

Update the API URL in ERP settings to point to your OpenWA instance.
