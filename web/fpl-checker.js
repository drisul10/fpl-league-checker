const https = require('https');
const fs = require('fs');
const config = require('./rules-config');

const ARSENAL_TEAM_ID = 1;
let arsenalPlayers = new Set();
let allPlayers = {};
let leagueName = '';

/**
 * Fetch data from URL
 */
function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Load master data and identify Arsenal players
 */
async function loadMasterData() {
    console.log('Loading master data...');
    const url = config.api.baseUrl + config.api.endpoints.bootstrap;
    const data = await fetchData(url);
    
    // Store all players and identify Arsenal players
    data.elements.forEach(player => {
        allPlayers[player.id] = {
            name: player.web_name,
            team: player.team,
            position: player.element_type,
            price: player.now_cost / 10
        };
        
        if (player.team === ARSENAL_TEAM_ID) {
            arsenalPlayers.add(player.id);
        }
    });
    
    console.log(`Found ${arsenalPlayers.size} Arsenal players`);
    return data;
}

/**
 * Get all teams from the league
 */
async function getLeagueTeams() {
    console.log(`Fetching league ${config.league.id} standings...`);
    const maxTeams = config.league.maxTeamsToCheck;
    let allTeams = [];
    let page = 1;
    let hasNext = true;
    
    while (hasNext) {
        const url = config.api.baseUrl + 
            config.api.endpoints.leagueStandings
                .replace('{leagueId}', config.league.id) + 
            `?page_new_entries=1&page_standings=${page}&phase=1`;
        
        const data = await fetchData(url);
        
        // Get league name from first page
        if (page === 1 && data.league && data.league.name) {
            leagueName = data.league.name;
        }
        
        if (data.standings && data.standings.results) {
            allTeams = allTeams.concat(data.standings.results);
        }
        
        hasNext = data.standings?.has_next || false;
        
        // Stop if we've reached the max teams limit
        if (maxTeams && allTeams.length >= maxTeams) {
            allTeams = allTeams.slice(0, maxTeams);
            break;
        }
        
        page++;
        if (page > 20) break; // Safety limit
    }
    
    console.log(`Processing ${allTeams.length} teams from league`);
    return allTeams;
}

/**
 * Check if a team meets Arsenal player count requirements
 */
function checkPlayerCount(count, requirement) {
    if (!requirement.enabled) return true;
    
    switch (requirement.operator) {
        case "exactly":
            return count === requirement.count;
        case "minimum":
            return count >= requirement.count;
        case "maximum":
            return count <= requirement.count;
        default:
            return false;
    }
}

/**
 * Check team picks against rules
 */
async function checkTeamPicks(entryId, gameweek) {
    const url = config.api.baseUrl + 
        config.api.endpoints.teamPicks
            .replace('{entryId}', entryId)
            .replace('{gameweek}', gameweek);
    
    try {
        const data = await fetchData(url);
        
        let arsenalInStartingXI = 0;
        let arsenalPlayerNames = [];
        let captainIsArsenal = false;
        let viceCaptainIsArsenal = false;
        let captainName = '';
        let viceCaptainName = '';
        
        data.picks.forEach(pick => {
            const isArsenalPlayer = arsenalPlayers.has(pick.element);
            
            // Check if in starting XI (multiplier > 0)
            if (pick.multiplier > 0 && isArsenalPlayer) {
                arsenalInStartingXI++;
                arsenalPlayerNames.push(allPlayers[pick.element]?.name || 'Unknown');
            }
            
            // Check captain
            if (pick.is_captain) {
                captainIsArsenal = isArsenalPlayer;
                captainName = allPlayers[pick.element]?.name || 'Unknown';
            }
            
            // Check vice-captain
            if (pick.is_vice_captain) {
                viceCaptainIsArsenal = isArsenalPlayer;
                viceCaptainName = allPlayers[pick.element]?.name || 'Unknown';
            }
        });
        
        // Evaluate Arsenal rules
        const playerCountPass = checkPlayerCount(arsenalInStartingXI, config.arsenal.playersInStartingXI);
        const captainPass = !config.arsenal.captain.enabled || !config.arsenal.captain.mustBeArsenal || captainIsArsenal;
        const viceCaptainPass = !config.arsenal.viceCaptain.enabled || !config.arsenal.viceCaptain.mustBeArsenal || viceCaptainIsArsenal;
        
        const allRulesPassed = playerCountPass && captainPass && viceCaptainPass;
        
        return {
            arsenalInStartingXI,
            arsenalPlayerNames,
            captainName,
            viceCaptainName,
            captainIsArsenal,
            viceCaptainIsArsenal,
            checks: {
                playerCount: playerCountPass,
                captain: captainPass,
                viceCaptain: viceCaptainPass
            },
            allRulesPassed
        };
        
    } catch (error) {
        console.error(`Error checking team ${entryId}:`, error.message);
        return null;
    }
}

/**
 * Generate HTML report
 */
function generateHTMLReport(results) {
    const compliantTeams = results.filter(r => r.allRulesPassed);
    const nonCompliantTeams = results.filter(r => !r.allRulesPassed);
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${leagueName} Rules Check - GW${config.league.gameweek}</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 15px; 
            background: linear-gradient(135deg, #ef0107 0%, #063672 100%);
            min-height: 100vh;
        }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            background: white; 
            padding: 20px; 
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 { 
            color: #ef0107; 
            text-align: center;
            font-size: clamp(1.8rem, 4vw, 2.5rem);
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 20px;
            font-size: clamp(1rem, 2.5vw, 1.2rem);
        }
        .rules-box {
            background: #fff3cd;
            border-left: 4px solid #ef0107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .rules-box h3 {
            margin-top: 0;
            color: #ef0107;
            font-size: clamp(1.1rem, 2.5vw, 1.3rem);
        }
        .rules-box ul {
            margin: 10px 0;
            padding-left: 25px;
        }
        .rules-box li {
            font-size: clamp(0.9rem, 2vw, 1rem);
        }
        .summary { 
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0;
            text-align: center;
        }
        .summary-item {
            min-width: 120px;
        }
        .summary-number {
            font-size: clamp(1.8rem, 4vw, 2.5rem);
            font-weight: bold;
            color: #333;
        }
        .summary-label {
            color: #666;
            margin-top: 5px;
            font-size: clamp(0.8rem, 2vw, 1rem);
        }
        .table-container {
            overflow-x: auto;
            margin: 20px 0;
            -webkit-overflow-scrolling: touch;
        }
        table { 
            width: 100%; 
            min-width: 800px;
            border-collapse: collapse; 
        }
        th { 
            background: #ef0107; 
            color: white; 
            padding: 12px 8px; 
            text-align: left;
            position: sticky;
            top: 0;
            font-size: clamp(0.8rem, 1.8vw, 1rem);
            white-space: nowrap;
        }
        td { 
            padding: 10px 8px; 
            border-bottom: 1px solid #ddd;
            font-size: clamp(0.8rem, 1.5vw, 0.95rem);
        }
        tr:hover {
            background: #f5f5f5;
        }
        .compliant { 
            background: #e8f5e9;
        }
        .non-compliant { 
            background: #ffebee;
        }
        .badge {
            display: inline-block;
            padding: 3px 6px;
            border-radius: 12px;
            font-size: clamp(0.7rem, 1.5vw, 0.85rem);
            font-weight: 600;
            white-space: nowrap;
        }
        .badge-success {
            background: #4caf50;
            color: white;
        }
        .badge-error {
            background: #f44336;
            color: white;
        }
        .badge-warning {
            background: #ff9800;
            color: white;
            word-break: break-word;
        }
        .player-list {
            font-size: clamp(0.75rem, 1.5vw, 0.9rem);
            color: #666;
            margin-top: 3px;
            word-break: break-word;
        }
        h2 {
            margin-top: 40px;
            padding-bottom: 10px;
            border-bottom: 2px solid #ef0107;
            font-size: clamp(1.3rem, 3vw, 1.5rem);
        }
        .timestamp {
            text-align: center;
            color: #999;
            font-size: clamp(0.8rem, 1.5vw, 0.9rem);
            margin-top: 30px;
        }
        
        /* Mobile-specific styles */
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            .container {
                padding: 15px;
            }
            .summary {
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                padding: 15px;
            }
            .rules-box {
                padding: 12px;
                margin: 15px 0;
            }
            th, td {
                padding: 8px 6px;
            }
            .badge {
                font-size: 0.75rem;
                padding: 2px 4px;
            }
        }
        
        @media (max-width: 480px) {
            .summary {
                grid-template-columns: 1fr;
            }
            th, td {
                padding: 6px 4px;
            }
            table {
                min-width: 700px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚽ ${leagueName} Rule Checker</h1>
        <p class="subtitle">Fantasy Premier League - League ${config.league.id} - Gameweek ${config.league.gameweek}</p>
        
        <div class="rules-box">
            <h3>📋 Active Rules:</h3>
            <ul>`;
    
    if (config.arsenal.playersInStartingXI.enabled) {
        html += `<li>${config.arsenal.playersInStartingXI.description}</li>`;
    }
    if (config.arsenal.captain.enabled && config.arsenal.captain.mustBeArsenal) {
        html += `<li>${config.arsenal.captain.description}</li>`;
    }
    if (config.arsenal.viceCaptain.enabled && config.arsenal.viceCaptain.mustBeArsenal) {
        html += `<li>${config.arsenal.viceCaptain.description}</li>`;
    }
    
    html += `
            </ul>
        </div>
        
        <div class="summary">
            <div class="summary-item">
                <div class="summary-number">${results.length}</div>
                <div class="summary-label">Total Teams</div>
            </div>
            <div class="summary-item">
                <div class="summary-number" style="color: #4caf50;">${compliantTeams.length}</div>
                <div class="summary-label">Compliant</div>
            </div>
            <div class="summary-item">
                <div class="summary-number" style="color: #f44336;">${nonCompliantTeams.length}</div>
                <div class="summary-label">Non-Compliant</div>
            </div>
            <div class="summary-item">
                <div class="summary-number">${Math.round(compliantTeams.length / results.length * 100)}%</div>
                <div class="summary-label">Compliance Rate</div>
            </div>
        </div>`;
    
    // Compliant teams table
    if (config.output.showCompliantTeams && compliantTeams.length > 0) {
        html += `
        <h2>✅ Teams Following All Rules (${compliantTeams.length})</h2>
        <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Manager</th>
                    <th>Team Name</th>
                    <th>Arsenal Players (Starting XI)</th>
                    <th>Captain</th>
                    <th>Vice-Captain</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>`;
        
        compliantTeams.sort((a, b) => a.rank - b.rank).forEach(team => {
            html += `
                <tr class="compliant">
                    <td><strong>${team.rank}</strong></td>
                    <td>${team.player_name}</td>
                    <td><strong>${team.entry_name}</strong></td>
                    <td>
                        <span class="badge badge-success">${team.arsenalInStartingXI}</span>
                        ${team.arsenalPlayerNames.length > 0 ? 
                            `<div class="player-list">${team.arsenalPlayerNames.join(', ')}</div>` : ''}
                    </td>
                    <td>${team.captainName} 
                        ${team.captainIsArsenal ? '<span class="badge badge-success">✓</span>' : ''}</td>
                    <td>${team.viceCaptainName}
                        ${team.viceCaptainIsArsenal ? '<span class="badge badge-success">✓</span>' : ''}</td>
                    <td><span class="badge badge-success">COMPLIANT</span></td>
                </tr>`;
        });
        
        html += `
            </tbody>
        </table>
        </div>`;
    }
    
    // Non-compliant teams table
    if (config.output.showNonCompliantTeams && nonCompliantTeams.length > 0) {
        html += `
        <h2>❌ Teams Not Following Rules (${nonCompliantTeams.length})</h2>
        <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Manager</th>
                    <th>Team Name</th>
                    <th>Arsenal Players (Starting XI)</th>
                    <th>Captain</th>
                    <th>Vice-Captain</th>
                    <th>Issues</th>
                </tr>
            </thead>
            <tbody>`;
        
        nonCompliantTeams.sort((a, b) => a.rank - b.rank).forEach(team => {
            let issues = [];
            
            if (!team.checks.playerCount) {
                issues.push(`${team.arsenalInStartingXI}/${config.arsenal.playersInStartingXI.count} Arsenal players`);
            }
            if (!team.checks.captain) {
                issues.push('Non-Arsenal captain');
            }
            if (!team.checks.viceCaptain) {
                issues.push('Non-Arsenal vice-captain');
            }
            
            html += `
                <tr class="non-compliant">
                    <td><strong>${team.rank}</strong></td>
                    <td>${team.player_name}</td>
                    <td><strong>${team.entry_name}</strong></td>
                    <td>
                        <span class="badge ${team.checks.playerCount ? 'badge-success' : 'badge-error'}">${team.arsenalInStartingXI}</span>
                        ${team.arsenalPlayerNames.length > 0 ? 
                            `<div class="player-list">${team.arsenalPlayerNames.join(', ')}</div>` : ''}
                    </td>
                    <td>${team.captainName} 
                        <span class="badge ${team.captainIsArsenal ? 'badge-success' : 'badge-error'}">
                            ${team.captainIsArsenal ? '✓' : '✗'}
                        </span>
                    </td>
                    <td>${team.viceCaptainName}
                        <span class="badge ${team.viceCaptainIsArsenal ? 'badge-success' : 'badge-error'}">
                            ${team.viceCaptainIsArsenal ? '✓' : '✗'}
                        </span>
                    </td>
                    <td><span class="badge badge-warning">${issues.join(', ')}</span></td>
                </tr>`;
        });
        
        html += `
            </tbody>
        </table>
        </div>`;
    }
    
    html += `
        <p class="timestamp">Report generated on ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>`;
    
    return html;
}

/**
 * Main function
 */
async function main() {
    console.log('='.repeat(60));
    console.log('FPL Rules Checker - Loading...');
    console.log(`League: ${config.league.id} | Gameweek: ${config.league.gameweek}`);
    if (config.league.maxTeamsToCheck) {
        console.log(`Checking first ${config.league.maxTeamsToCheck} teams`);
    }
    console.log('='.repeat(60));
    
    try {
        // Load master data
        await loadMasterData();
        
        // Get league teams
        const teams = await getLeagueTeams();
        
        // Now display the proper title with league name
        console.log(`\n📊 ${leagueName} Rules Checker`);
        
        console.log('\nChecking teams against league rules...\n');
        
        const results = [];
        const batchSize = config.api.batchSize;
        
        // Process teams in batches
        for (let i = 0; i < teams.length; i += batchSize) {
            const batch = teams.slice(i, Math.min(i + batchSize, teams.length));
            const batchPromises = batch.map(team => 
                checkTeamPicks(team.entry, config.league.gameweek).then(checkResult => 
                    checkResult ? { ...team, ...checkResult } : null
                )
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
            
            if (config.output.consoleOutput.showDetails) {
                console.log(`Processed ${Math.min(i + batchSize, teams.length)}/${teams.length} teams...`);
            }
            
            // Delay between batches
            if (config.api.requestDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, config.api.requestDelay));
            }
        }
        
        console.log(`\n✅ Processed all ${results.length} teams successfully!\n`);
        
        // Calculate summary
        const compliant = results.filter(r => r.allRulesPassed);
        const nonCompliant = results.filter(r => !r.allRulesPassed);
        
        if (config.output.consoleOutput.showSummary) {
            console.log('='.repeat(60));
            console.log('SUMMARY:');
            console.log(`Total teams checked: ${results.length}`);
            console.log(`Teams following ALL rules: ${compliant.length} (${Math.round(compliant.length/results.length*100)}%)`);
            console.log(`Teams NOT following rules: ${nonCompliant.length} (${Math.round(nonCompliant.length/results.length*100)}%)`);
            console.log('='.repeat(60));
            
            // Show some compliant teams
            if (compliant.length > 0 && config.output.showCompliantTeams) {
                console.log('\n✅ SAMPLE OF COMPLIANT TEAMS:');
                console.log('-'.repeat(60));
                compliant.slice(0, 5).forEach(team => {
                    console.log(`[Rank ${team.rank}] ${team.player_name} - "${team.entry_name}"`);
                });
                if (compliant.length > 5) {
                    console.log(`... and ${compliant.length - 5} more`);
                }
            }
        }
        
        // Generate HTML report
        if (config.output.generateHTMLReport) {
            // Create output directory if it doesn't exist
            const outputDir = config.output.outputDirectory || 'out';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // Generate filename based on pattern
            const filename = config.output.htmlReportFilenamePattern
                .replace('{gameweek}', config.league.gameweek)
                .replace('{leagueId}', config.league.id);
            
            const fullPath = `${outputDir}/${filename}`;
            
            const html = generateHTMLReport(results);
            fs.writeFileSync(fullPath, html);
            console.log(`\n📄 HTML report saved as: ${fullPath}`);
            console.log('Open this file in your browser to see the detailed results.');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run the checker
if (require.main === module) {
    main();
}

module.exports = { main, checkTeamPicks, loadMasterData };