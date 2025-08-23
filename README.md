# FPL Rules Compliance Checker

A flexible Fantasy Premier League (FPL) tool to check if teams in your league comply with custom rules.

## Features

- ✅ Configurable team-specific rules
- ✅ Check player counts in starting XI
- ✅ Validate captain and vice-captain selections
- ✅ Support for multiple teams and rule combinations
- ✅ HTML report generation
- ✅ Batch processing with rate limiting

## Quick Start

1. **Run with default Arsenal rules:**
   ```bash
   node fpl-checker.js
   ```

2. **View the HTML report:**
   Open `fpl-rules-check-report.html` in your browser

## Configuration

Edit `rules-config.js` to customize the rules:

### Change League and Gameweek
```javascript
league: {
    id: 1806705,        // Your league ID
    gameweek: 2,        // Current gameweek
    maxTeamsToCheck: 100 // null for all teams
}
```

### Modify Arsenal Rules
```javascript
teamRules: {
    arsenal: {
        teamId: 1,
        teamName: "Arsenal",
        enabled: true,
        requirements: {
            playersInStartingXI: {
                enabled: true,
                count: 3,
                operator: "exactly", // Options: "exactly", "minimum", "maximum"
                description: "Must have exactly 3 Arsenal players"
            },
            captain: {
                enabled: true,
                mustBeFromTeam: true,
                description: "Captain must be Arsenal"
            },
            viceCaptain: {
                enabled: true,
                mustBeFromTeam: true,
                description: "Vice-captain must be Arsenal"
            }
        }
    }
}
```

## Example Custom Rules

### 1. Maximum 3 Manchester City Players
```javascript
manchesterCity: {
    teamId: 12,
    teamName: "Manchester City",
    enabled: true,
    requirements: {
        playersInStartingXI: {
            enabled: true,
            count: 3,
            operator: "maximum",
            description: "Maximum 3 City players allowed"
        },
        captain: { enabled: false },
        viceCaptain: { enabled: false }
    }
}
```

### 2. Minimum 2 Liverpool Players with Captain
```javascript
liverpool: {
    teamId: 11,
    teamName: "Liverpool",
    enabled: true,
    requirements: {
        playersInStartingXI: {
            enabled: true,
            count: 2,
            operator: "minimum",
            description: "At least 2 Liverpool players"
        },
        captain: {
            enabled: true,
            mustBeFromTeam: true,
            description: "Captain must be Liverpool"
        }
    }
}
```

### 3. No Tottenham Players (Ban)
```javascript
tottenham: {
    teamId: 17,
    teamName: "Tottenham",
    enabled: true,
    requirements: {
        playersInStartingXI: {
            enabled: true,
            count: 0,
            operator: "exactly",
            description: "No Spurs players allowed"
        }
    }
}
```

## Multiple Team Rules

You can enable multiple team rules simultaneously. Teams must pass ALL enabled rules to be considered compliant.

```javascript
teamRules: {
    arsenal: { 
        enabled: true,
        // ... Arsenal rules
    },
    chelsea: {
        enabled: true,
        // ... Chelsea rules
    }
}
```

## Team IDs Reference

| Team | ID | Team | ID |
|------|----|----- |----|
| Arsenal | 1 | Liverpool | 11 |
| Aston Villa | 2 | Man City | 12 |
| Bournemouth | 3 | Man United | 13 |
| Chelsea | 4 | Newcastle | 14 |
| Everton | 5 | Tottenham | 17 |
| Fulham | 6 | West Ham | 19 |
| Brighton | 22 | Wolves | 20 |
| Brentford | 27 | Crystal Palace | 28 |
| Nottingham | 29 | | |

## Output Options

Configure output in `rules-config.js`:

```javascript
output: {
    showCompliantTeams: true,      // Show passing teams
    showNonCompliantTeams: true,    // Show failing teams
    generateHTMLReport: true,       // Create HTML file
    htmlReportFilename: "report.html",
    consoleOutput: {
        showDetails: true,          // Progress details
        showSummary: true,          // Final summary
        coloredOutput: true         // Color coding
    }
}
```

## API Settings

Adjust rate limiting if needed:

```javascript
api: {
    requestDelay: 50,    // ms between requests
    batchSize: 5         // concurrent requests
}
```

## Files

- `fpl-checker.js` - Main checker script
- `rules-config.js` - Configuration file (edit this!)
- `example-custom-rules.js` - Example configurations
- `out/` - Output directory for generated reports
  - Reports are saved as: `gw{gameweek}-league{leagueId}-report.html`
  - Example: `out/gw2-league1806705-report.html`

## Troubleshooting

- **Timeout errors**: Reduce `maxTeamsToCheck` or increase `requestDelay`
- **Rate limiting**: Increase `requestDelay` between requests
- **Missing players**: Check team IDs match current season

## License

MIT