const { Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Create a new Discord client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Configuration
const MODS_CHANNEL_ID = '1405065075395395644'; // Private mods-only channel
const PREFIX = '.';

// Bot ready event
client.once('ready', () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

// Message handler for prefix commands
client.on('messageCreate', async (message) => {
    // Ignore messages from bots and messages without the prefix
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        if (command === 'form1') {
            await handleFormCommand(message, 'Community Script');
        } else if (command === 'form2') {
            await handleFormCommand(message, 'Request Script');
        }
    } catch (error) {
        console.error('Error handling command:', error);
        await message.reply('An error occurred while processing your command.');
    }
});

// Function to handle both form commands
async function handleFormCommand(message, formTitle) {
    // Create the modal
    const modal = new ModalBuilder()
        .setCustomId(`form_${formTitle.replace(' ', '_').toLowerCase()}_${message.author.id}`)
        .setTitle(formTitle);

    // Create text input components
    const gameInput = new TextInputBuilder()
        .setCustomId('game_input')
        .setLabel('What game are you submitting this for?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    const keylessInput = new TextInputBuilder()
        .setCustomId('keyless_input')
        .setLabel('Is this keyless?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setPlaceholder('Yes or No');

    const scriptInput = new TextInputBuilder()
        .setCustomId('script_input')
        .setLabel('Script:')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000);

    // Create action rows for the inputs
    const gameRow = new ActionRowBuilder().addComponents(gameInput);
    const keylessRow = new ActionRowBuilder().addComponents(keylessInput);
    const scriptRow = new ActionRowBuilder().addComponents(scriptInput);

    // Add components to modal
    modal.addComponents(gameRow, keylessRow, scriptRow);

    // Show the modal to the user
    await message.reply({ content: `Opening ${formTitle} form...`, ephemeral: true });
    
    // Note: We need to use interaction.showModal(), but since this is a message command,
    // we'll need to create a button that triggers the modal instead
    await showModalThroughButton(message, modal, formTitle);
}

// Helper function to show modal through a button (workaround for message commands)
async function showModalThroughButton(message, modal, formTitle) {
    const button = new ButtonBuilder()
        .setCustomId(`open_modal_${modal.data.custom_id}`)
        .setLabel(`Open ${formTitle} Form`)
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    const response = await message.reply({
        content: `Click the button below to open the ${formTitle} form:`,
        components: [row]
    });

    // Store the modal data temporarily (in a real bot, you might use a database)
    client.pendingModals = client.pendingModals || new Map();
    client.pendingModals.set(`open_modal_${modal.data.custom_id}`, modal);

    // Auto-delete the button message after 5 minutes
    setTimeout(() => {
        response.delete().catch(console.error);
        client.pendingModals.delete(`open_modal_${modal.data.custom_id}`);
    }, 5 * 60 * 1000);
}

// Handle button interactions (for opening modals)
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            // Handle modal opening buttons
            if (interaction.customId.startsWith('open_modal_')) {
                const modal = client.pendingModals?.get(interaction.customId);
                if (modal) {
                    await interaction.showModal(modal);
                } else {
                    await interaction.reply({ content: 'This form has expired. Please use the command again.', ephemeral: true });
                }
                return;
            }

            // Handle approval/denial buttons
            if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('deny_')) {
                await handleApprovalButtons(interaction);
            }
        }

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            await handleModalSubmission(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        }
    }
});

// Handle modal form submissions
async function handleModalSubmission(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    // Extract form type from custom ID
    let formTitle;
    if (customId.includes('community_script')) {
        formTitle = 'Community Script';
    } else if (customId.includes('request_script')) {
        formTitle = 'Request Script';
    } else {
        await interaction.reply({ content: 'Unknown form type.', ephemeral: true });
        return;
    }

    // Get the form responses
    const gameAnswer = interaction.fields.getTextInputValue('game_input');
    const keylessAnswer = interaction.fields.getTextInputValue('keyless_input');
    const scriptAnswer = interaction.fields.getTextInputValue('script_input');

    // Create embed for the mods channel
    const embed = new EmbedBuilder()
        .setTitle(`${formTitle} Submission`)
        .setColor('#0099ff')
        .addFields(
            { name: 'User', value: `${interaction.user.username} (${interaction.user.id})`, inline: false },
            { name: 'What game are you submitting this for?', value: gameAnswer, inline: false },
            { name: 'Is this keyless?', value: keylessAnswer, inline: false },
            { name: 'Script:', value: scriptAnswer.length > 1024 ? scriptAnswer.substring(0, 1021) + '...' : scriptAnswer, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Submitted by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    // Create approval/denial buttons
    const approveButton = new ButtonBuilder()
        .setCustomId(`approve_${userId}_${Date.now()}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success);

    const denyButton = new ButtonBuilder()
        .setCustomId(`deny_${userId}_${Date.now()}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger);

    const buttonRow = new ActionRowBuilder().addComponents(approveButton, denyButton);

    // Send to mods channel
    const modsChannel = client.channels.cache.get(MODS_CHANNEL_ID);
    if (modsChannel) {
        await modsChannel.send({
            embeds: [embed],
            components: [buttonRow]
        });

        await interaction.reply({ content: 'Your form has been submitted successfully! Moderators will review it shortly.', ephemeral: true });
    } else {
        console.error('Mods channel not found!');
        await interaction.reply({ content: 'Error: Could not find the moderators channel.', ephemeral: true });
    }
}

// Handle approval/denial button clicks
async function handleApprovalButtons(interaction) {
    const customId = interaction.customId;
    const action = customId.startsWith('approve_') ? 'Approved' : 'Denied';
    const emoji = action === 'Approved' ? '✅' : '❌';
    const moderator = interaction.user.username;

    // Get the original message
    const message = interaction.message;
    const originalEmbed = message.embeds[0];

    // Create updated embed with approval/denial status
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(action === 'Approved' ? '#00ff00' : '#ff0000')
        .addFields({ name: 'Status', value: `${emoji} ${action} by ${moderator}`, inline: false });

    // Update the message with new embed and remove buttons
    await interaction.update({
        embeds: [updatedEmbed],
        components: []
    });
}

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
// Replace 'YOUR_BOT_TOKEN' with your actual bot token
client.login('MTQwMDkwMzg3ODkzMjY5MzA2Mg.Gc6t4Y.IuL8hiRJ-60RjobLUypFaKkPFk_YNzDjOxR774');

// Instructions for setup:
/*
1. Install dependencies:
   npm install discord.js

2. Replace 'YOUR_BOT_TOKEN' with your actual Discord bot token

3. Make sure your bot has the following permissions:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Read Message History

4. Ensure the bot can access the mods channel (ID: 1405065075395396644)

5. Run the bot:
   node your-bot-file.js
*/