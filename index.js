//This script is used for migrating Jira Issues into ClickUp as Tasks.
//Here's what it can do:
//Create a clickup task for every jira issue found using the specified jql query
//Create subtasks in clickup and keep the same subtask structure that was in Jira (will handle all layers)
//Migrate custom fields
//Automatically finds custom field IDs on clickup, can handle dropdown options, and multiple labels.
//Migrate Comments (takes all Jira comments and rolls them up into one big clickup comment, but it does say who said what.)
//Migrate attachments

const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const colors = require("colors");
const listId = ""; //List to migrate to
const maxResults = 100; //number of records to pull from Jira in one go (max is 100)
const { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } = require("node-html-markdown");
const CUKey = ""; //ClickUp API Key
const JiraKey = ""; //Jira API Key
const jqlQuery = 'project = LE and status = "closed" and type != sub-task ORDER BY created DESC`='; // Modify this to query for whatever data you want to migrate
const jiraURL = "https://example.atlassian.net"; //The Jira instance we're pulling data from.

let customFields;

//headers for calls to Jira API
const JiraHeaders = {
	Authorization: JiraKey,
	"Content-Type": "application/json",
};

//Headers for calls to ClickUp API.
const CUHeaders = {
	Authorization: CUKey,
	"Content-Type": "application/json",
};

//
const main = async () => {
	//Get the custom fields for the list we're importing to:
	let res = await axios.get(`https://api.clickup.com/api/v2/list/${listId}/field`, { headers: CUHeaders });
	customFields = res.data;
	//res = await axios.get(`https://app.asana.com/api/1.0/projects`, { headers: AsanaHeaders });
	//projects = res.data;

	let URL = `${jiraURL}/rest/api/3/search`;

	let offset = 0; //initial offset. Use this if an error occurs during the migration and you don't want to start over.
	let done = false;

	//pull 100 jira issues at a time until no more issues are found
	while (!done) {
		let body = {
			jql: jqlQuery,
			maxResults: maxResults,
			startAt: offset,
		};
		res = await axios.post(URL, body, { headers: JiraHeaders }); //Make the call to jira to pull 100 issues
		let issues = res.data.issues;
		console.log(`Total Issues found: ${res.data.total}`.yellow);
		if (issues.length < 1) {
			//check if that was the last page.
			done = true;
			console.log("THAT WAS THE LAST PAGE>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
			continue;
		}
		console.log(`Offset = ${offset}. Starting with issue ID ${issues[0].id}`.brightGreen); //Log the offset. If an error occurs, change the offset variable above to whatever this said.
		offset += maxResults; //update the offset

		for (let i = 0; i < issues.length; i++) {
			//loop through the issues.
			await delay(3000); //pause to avoid rate limiting and CU API errors.
			try {
				console.log(`${offset + i - 100}`.white.bgMagenta);
				createTask(issues[i]); //create the task
			} catch (err) {
				console.log(`<<ERROR>> creating task: ${issues[i].fields.key}`.brightRed);
				console.log(err.response.data);
			}
		}
	}
};

const createTask = async (issue, parent = null) => {
	return new Promise(async (resolve, reject) => {
		console.log(`Creating Task: ${issue.key}, ${issue.id}`.brightBlue);

		//get the full version of the task:
		let res = await axios.get(`${jiraURL}/rest/api/3/issue/${issue.key}?expand=renderedFields`, {
			headers: JiraHeaders,
		});
		issue = res.data;

		//Translate the HTML description into markdown
		let newDesc = NodeHtmlMarkdown.translate(issue.renderedFields.description);

		//construct clickup create task request:
		let URL = `https://api.clickup.com/api/v2/list/${listId}/task`;
		let body = {
			name: issue.fields.summary,
			markdown_description: newDesc,
			status: issue.fields.status.name,
			assignees: null,
			parent: parent ? parent : null,
			notify_all: false,
			check_required_custom_fields: false,
			custom_fields: [
				{
					id: findCFID("Development Team"),
					value: issue.fields.customfield_13200
						? findCFOptionID(issue.fields.customfield_13200[0].value, "Development Team")
						: null,
				},
				{
					id: findCFID("Priority"),
					value: issue.fields.priority ? findCFOptionID(issue.fields.priority.name, "Priority") : null,
				},
				{
					id: findCFID("Issue Type"),
					value: findCFOptionID(issue.fields.issuetype.name, "Issue Type"),
				},
				{
					id: findCFID("Created"),
					value: new Date(issue.fields.created).getTime(),
				},
				{
					id: findCFID("Incident End"),
					value: issue.fields.customfield_13403 ? new Date(issue.fields.customfield_13403).getTime() : null,
				},
				{
					id: findCFID("Incident Start"),
					value: issue.fields.customfield_13402 ? new Date(issue.fields.customfield_13402).getTime() : null,
				},
				{
					id: findCFID("Updated"),
					value: new Date(issue.fields.updated).getTime(),
				},
				{
					id: findCFID("Jira Issue Key"),
					value: issue.key,
				},
				{
					id: findCFID("Jira Assignee"),
					value: issue.fields.assignee ? issue.fields.assignee.displayName : null,
				},
				{
					id: findCFID("PM Assignee"),
					value: issue.fields.customfield_10900 ? issue.fields.customfield_10900.displayName : null,
				},
				{
					id: findCFID("QA Assignee"),
					value: null,
				},
				{
					id: findCFID("Jira Reporter"),
					value: issue.fields.reporter.displayName,
				},
				{
					id: findCFID("Resolution (New)"),
					value: issue.fields.resolution ? issue.fields.resolution.name : "Unresolved",
				},
				{
					id: findCFID("Sprint"),
					value: issue.fields.customfield_10007 ? issue.fields.customfield_10007[0].name : null,
				},
				{
					id: findCFID("Story Points"),
					value: issue.fields.customfield_10004,
				},
				{
					id: findCFID("Summary"),
					value: issue.fields.summary,
				},
				{
					id: findCFID("Client"),
					value: createLabelArray(issue.fields.customfield_10300, "Client"),
				},
				{
					id: findCFID("Components"),
					value: issue.fields.components
						? createLabelArray(
								issue.fields.components.map((a) => a.name),
								"Components"
						  )
						: null,
				},
				{
					id: findCFID("Product"),
					value: issue.fields.customfield_13300
						? createLabelArray(
								issue.fields.customfield_13300.map((a) => a.value),
								"Product"
						  )
						: null,
				},
				{
					id: findCFID("Required Documentation"),
					value: issue.fields.customfield_13500
						? createLabelArray(
								issue.fields.customfield_13500.map((a) => a.value),
								"Required Documentation"
						  )
						: null,
				},
				{
					id: findCFID("Invoiceable Amount"),
					value: issue.fields.customfield_13670,
				},
				{
					id: findCFID("Root Cause"),
					value: issue.fields.customfield_13400 ? issue.fields.customfield_13400.content[0].text : null,
				},
				{
					id: findCFID("Uptime Impact"),
					value: issue.fields.customfield_13401,
				},
				{
					id: findCFID("Epic Key"),
					value: issue.fields.customfield_10008 ? issue.fields.customfield_10008 : null,
				},
				{
					id: findCFID("Jira ID"),
					value: issue.id,
				},
				{
					id: findCFID("Issue Links"),
					value:
						issue.fields.issuelinks && issue.fields.issuelinks.length > 0
							? JSON.stringify(getIssueLinks(issue.fields.issuelinks))
							: null,
				},
			],
		};

		//Make the API call to create the task
		axios.post(URL, body, { headers: { Authorization: CUKey } }).then(async (response) => {
			let taskID = response.data.id;
			let taskName = response.data.name;
			console.log(`${issue.key},${issue.id}: ${response.status}: ${taskID}`);

			//Loop through the attachments
			(async function () {
				if (!issue.fields.attachment) {
					return;
				}
				for (let k = 0; k < issue.fields.attachment.length; k++) {
					await delay(3000);
					let id = issue.fields.attachment[k].id;
					let fileName = issue.fields.attachment[k].filename;
					let path = `./temp/${fileName}`;
					let URL = `${jiraURL}/rest/api/3/attachment/content/${id}`;
					//Download the attachment
					try {
						await downloadFile(URL, path);
						//console.log(`${fileName} downloaded.`);
					} catch (err) {
						console.log(`<<ERROR>> downloading image. ${fileName} for ${taskName}`.brightRed);
						console.log(err.response ? err.response.data : err);
					}

					//Upload the attachment

					await delay(3000);
					form = new FormData();
					form.append("filename", fileName);
					form.append("attachment", fs.createReadStream(path));
					let headers = form.getHeaders();
					headers.Authorization = CUKey;
					axios({
						method: "post",
						url: `https://api.clickup.com/api/v2/task/${taskID}/attachment`,
						data: form,
						headers: headers,
						maxContentLength: Infinity,
						maxBodyLength: Infinity,
					})
						.then((res) => {
							//console.log("Attached " + fileName + " to " + issue.key);
						})
						.catch((err) => {
							console.log(`<<ERROR>> adding attachment ${fileName} to ${issue.key}`.brightRed);
							console.log(err.response.data);
							return reject(err.response.data);
						});
				}
			})();

			//Create a big comment to add:
			let commentText = "";
			if (issue.fields.comment) {
				try {
					issue.fields.comment.comments.forEach((item) => {
						commentText += `${item.author.displayName} commented: \n`;
						item.body.content.forEach((item2) => {
							item2.content.forEach((item3) => {
								if (item3.text) {
									commentText += item3.text + `\n`;
								}
							});
						});
					});
				} catch (err) {
					console.log(`There was an error parsing the comments on ${issue.key}`.brightRed);
				}

				if (commentText.length > 0) {
					//Add the comment to the ClickUp Task
					delay(1000);
					axios
						.post(
							`https://api.clickup.com/api/v2/task/${taskID}/comment`,
							{ comment_text: commentText, notify_all: false },
							{ headers: CUHeaders }
						)
						.then((res) => {
							//console.log(`Comment posted to ${issue.key}`);
						})
						.catch((err) => {
							console.log(`<<ERROR>>Failed to add comment to ${issue.key}`.brightRed);
							console.log(err.response.data);
						});
				}
			}

			if (issue.fields.subtasks) {
				for (let j = 0; j < issue.fields.subtasks.length; j++) {
					await delay(3000);
					try {
						createTask(issue.fields.subtasks[j], taskID);
					} catch (err) {
						console.log(`<<ERROR>> creating task: ${issue.fields.subtasks[j].key}`.brightRed);
						console.log(err.response.data);
					}
				}
			}
		}); //this is the end of the .then on the axios call to create the task.

		return resolve;
	}).catch((err) => {
		console.log(`<<ERROR>> creating task: ${issue.key}`.brightRed);
		if (err.response && err.response.data) {
			console.log(err.response.data);
		} else {
			console.log(err);
		}

		//return reject(err);
	});
};

//Takes a jira issuelink field and Returns an array of jira ids.
const getIssueLinks = (links) => {
	let linkIds = [];
	links.forEach((link) => {
		if (link.outwardIssue) {
			linkIds.push(link.outwardIssue.id);
		}
		if (link.inwardIssue) {
			linkIds.push(link.inwardIssue.id);
		}
	});
	return linkIds;
};

//Takes a custom field name and returns the ID for the custom field.
const findCFID = (name) => {
	let id = customFields.fields.filter((item) => {
		return item.name == name;
	})[0];
	if (id) {
		return id.id;
	} else {
		console.log(`<<ERROR>> Could not get CF ID for ${name}`.brightRed);
	}
};

//This function takes a  custom field option name and a custom field name and returns
//the ID of the custom field value. It depends on the function findCFID.
const findCFOptionID = (CFValue, CFName) => {
	if (!CFValue) {
		return null;
	}
	let CUCFID = findCFID(CFName);
	//get the option ids from the CU CF
	let CFOptions = customFields.fields.filter((item) => {
		return item.id == CUCFID;
	})[0].type_config.options;
	//return the option ID that matches the CF value
	let optionID;
	if (CFOptions[0].label) {
		optionID = CFOptions.filter((item) => {
			return item.label == CFValue;
		})[0];
		if (optionID) {
			optionID = optionID.id;
		}
	} else {
		optionID = CFOptions.filter((item) => {
			return item.name == CFValue;
		})[0];
		if (optionID) {
			optionID = optionID.id;
		}
	}
	if (!optionID) {
		console.log(`<<ERROR>>: Could not get CF Option ID for ${CFName}, ${CFValue}`.brightRed);
	}
	return optionID;
};

const createLabelArray = (jiraFieldData, CFName) => {
	if (!jiraFieldData) {
		return null;
	}
	let idArray = [];
	jiraFieldData.forEach((item) => {
		idArray.push(findCFOptionID(item, CFName));
	});
	return idArray;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDate = (d) => {
	let date = new Date(d);
	return (
		(date.getMonth() > 8 ? date.getMonth() + 1 : "0" + (date.getMonth() + 1)) +
		"/" +
		(date.getDate() > 9 ? date.getDate() : "0" + date.getDate()) +
		"/" +
		date.getFullYear()
	);
};

async function downloadFile(fileUrl, outputLocationPath) {
	const writer = fs.createWriteStream(outputLocationPath);
	return axios.get(fileUrl, { headers: JiraHeaders, responseType: "stream" }).then((response) => {
		//ensure that the user can call `then()` only when the file has
		//been downloaded entirely.
		return new Promise((resolve, reject) => {
			response.data.pipe(writer);
			let error = null;
			writer.on("error", (err) => {
				error = err;
				writer.close();
				reject(err);
			});
			writer.on("close", () => {
				if (!error) {
					resolve(true);
				}
				//no need to call the reject here, as it will have been called in the
				//'error' stream;
			});
		});
	});
}

main();
