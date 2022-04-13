const fs = require("fs");
const https = require("https");
const axios = require("axios");
const FormData = require("form-data");
const colors = require("colors");
const listId = "163664754";
const maxResults = 100;
const CUKey = "pk_24633738_X2B7OX05XVPK72DMFZ3PG24V0DRQB4DJ";

let customFields;

const JiraHeaders = {
	Authorization: "Basic amZvbGV5QGNsaWNrdXAuY29tOmhzdXRUSzNWVVdMdU1WZkI2bXR4NzYzQw==",
	"Content-Type": "application/json",
};

const CUHeaders = {
	Authorization: "pk_24633738_X2B7OX05XVPK72DMFZ3PG24V0DRQB4DJ",
	"Content-Type": "application/json",
};

const main = async () => {
	// get tasks that have epic key field populated
	// for each task, find the task whose key is the epic key
	// make a link to that task

	//Get the custom fields for the list we're importing to:
	let res = await axios.get(`https://api.clickup.com/api/v2/list/${listId}/field`, { headers: CUHeaders });
	customFields = res.data;

	let page = 0;

	let done = false;
	while (!done) {
		/*
			New
			Backlog
			In Progress
			Merged
			Release Validation
			To Discover 
			In Discovery
			Done
			Closed
		*/

		let status = "closed";

		//get tasks that have something in the issue links field
		res = await axios.get(
			`https://api.clickup.com/api/v2/team/36600298/task?page=${page}&list_ids[]=163664754&statuses[]=${status}&subtasks=true&custom_fields=[{"field_id":"ce3ab769-6f5e-4f93-ad43-7235b6422775","operator":"!=","value":null}]`,
			{ headers: CUHeaders }
		);

		let tasks = res.data.tasks;

		console.log(`Found ${tasks.length} tasks`);

		if (tasks.length < 1) {
			done = true;
			console.log("THAT WAS THE LAST PAGE>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
			continue;
		}
		console.log(`Page = ${page}`.brightGreen);
		page++;

		for (let i = 0; i < tasks.length; i++) {
			await delay(500);
			try {
				createLinks(tasks[i]);
			} catch (err) {
				console.log(`<<ERROR>> creating task: ${issues[i].fields.key}`.brightRed);
				console.log(err.response.data);
			}
		}
	}
};

const createLinks = async (task) => {
	//get ids that need to be linked
	let ids = task.custom_fields.filter((item) => {
		return item.name == "Epic Key";
	})[0].value;

	//ids = JSON.parse(ids);
	ids = [ids];

	//loop through the ids
	for (let i = 0; i < ids.length; i++) {
		//find the task that has the right jira id
		res = await axios
			.get(
				`https://api.clickup.com/api/v2/team/36600298/task?page=0}&list_ids[]=163664754&include_closed=true&subtasks=true&custom_fields=[{"field_id":"3998d286-f73b-4703-bfe8-2c4951219bd3","operator":"=","value":"${ids[i]}"}]`,
				{ headers: CUHeaders }
			)
			.catch((err) => {
				console.log(error.response.data);
			});
		if (res.data.tasks.length < 1) {
			console.log(`Could not find task with id ${ids[i]}`.brightRed);
		} else {
			//make the links
			let taskToLink = res.data.tasks[0].id;
			console.log(`Linking ${taskToLink} to ${task.id}`.blue);
			await axios
				.post(
					`https://api.clickup.com/api/v2/task/${task.id}/field/4a88c9d1-6570-4ed3-bf94-4128be0b03c8`,
					{
						value: {
							add: [taskToLink],
						},
					},
					{ headers: { Authorization: CUKey } }
				)
				.then((res) => {
					console.log(`Linked ${taskToLink} to ${task.id}`.brightGreen);
				})
				.catch((err) => {
					`Error linking ${taskToLink} to ${task.id}`.brightRed;
				});
		}
	}
};

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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

main();
