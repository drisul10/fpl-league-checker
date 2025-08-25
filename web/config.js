
const FPLConfig = {
    api: {
        baseUrl: "https://fantasy.premierleague.com/api",
        endpoints: {
            bootstrap: "/bootstrap-static/",
            leagueStandings: "/leagues-classic/{leagueId}/standings/",
            teamPicks: "/entry/{entryId}/event/{gameweek}/picks/"
        },
        requestDelay: 600,
        batchSize: 1,
        maxRetries: 3,
        timeout: 10000
    },

    ARSENAL_TEAM_ID: 1,

    ui: {
        maxTeamsDisplay: 1000,
        animationDuration: 300,
        debounceDelay: 300
    },

    errors: {
        network: 'Network error. Please check your connection.',
        invalidLeague: 'Invalid league ID. Please check the number.',
        noData: 'No data found for this league.',
        timeout: 'Request timed out. Please try again.',
        generic: 'Something went wrong. Please try again.'
    },

    defaultRules: {
        playersInStartingXI: {
            enabled: true,
            count: 2,
            operator: 'minimum'
        },
        captain: {
            enabled: true,
            mustBeArsenal: true
        },
        viceCaptain: {
            enabled: true,
            mustBeArsenal: true
        }
    }
};

Object.freeze(FPLConfig);
Object.freeze(FPLConfig.api);
Object.freeze(FPLConfig.ui);
Object.freeze(FPLConfig.errors);
Object.freeze(FPLConfig.defaultRules);