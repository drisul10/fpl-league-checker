/**
 * FPL Arsenal Rules Configuration
 * 
 * Modify the values below to change the Arsenal checking rules
 */

module.exports = {
    // League settings
    league: {
        id: 436453,        // Your league ID
        gameweek: 2,        // Current gameweek to check
        maxTeamsToCheck: null // Number of teams to check (null = all teams)
    },

    // Arsenal rules configuration
    arsenal: {
        playersInStartingXI: {
            enabled: true,
            count: 2,
            operator: "minimum", // Options: "exactly", "minimum", "maximum"
            description: "Must have minimum 2 Arsenal players in starting XI"
        },
        captain: {
            enabled: true,
            mustBeArsenal: true,
            description: "Captain must be an Arsenal player"
        },
        viceCaptain: {
            enabled: true,
            mustBeArsenal: true,
            description: "Vice-captain must be an Arsenal player"
        }
    },

    // Output settings
    output: {
        showCompliantTeams: true,
        showNonCompliantTeams: true,
        generateHTMLReport: true,
        outputDirectory: "out",
        // Report filename: out/gw{gameweek}-league{leagueId}-report.html
        htmlReportFilenamePattern: "gw{gameweek}-league{leagueId}-report.html",
        consoleOutput: {
            showDetails: true,
            showSummary: true
        }
    },

    // API settings (usually don't need to change these)
    api: {
        baseUrl: "https://fantasy.premierleague.com/api",
        endpoints: {
            bootstrap: "/bootstrap-static/",
            leagueStandings: "/leagues-classic/{leagueId}/standings/",
            teamPicks: "/entry/{entryId}/event/{gameweek}/picks/"
        },
        requestDelay: 50,   // Milliseconds between requests
        batchSize: 5        // Number of concurrent requests
    }
};