# Progress Log

## Meetings

### Jan 15, 2026

Meeting lasted **21 minutes**.  
Discussed ITR0 objectives, and brainstormed user stories. Then, divided work between team members. Three members will work on the "Planning Document", one will meet with the customer to discuss project scope.

### Jan 20, 2026

Meeting lasted **2 hours**.

- Setup GitHub, and Jira,
- Define project scope, and decide the pitch to customer
- Come up with user stories
- Decide the tech stack for the project
- Divide the remaining work

### Jan 28, 2026

Meeting lasted **7 minutes**.  
Reviewed the work done for ITR0, then submitted.

### Feb 3, 2026

Meeting lasted **19 minutes**.  
Started coding, and creating React components.

### Feb 13, 2026

Meeting lasted **16 minutes**.

- Discussed ITR1 requiremnts
- Reviewed work done so far
- Discussed the creation of GitHub Wiki

### Feb 28, 2026

Meeting lasted **1 hour**.

- Discussed the current state of the project, and decided on some fixes
- Login/Signup UI changes

### Mar 1, 2026

Meeting lasted **1 hour**.

- Made final changes to the project for presentation
- Worked on the presentation slides
- Worked on the peer review form

### Mar 12, 2026

Meeting lasted **18 minutes**.

- Planned out ITR2 user stories, will meet tomorrow to finalize

### Mar 13, 2026

Meeting lasted **31 minutes**.

- Distributed work based on user stories

Things to implement:

- Materials tracking
- Workers time tracking
- Project progress tracking

### Mar 15, 2026

Meeting lasted **22 minutes**.

- Progress meeting, also verified some functionality

### Mar 19, 2026

Meeting lasted **14 minutes**.

- Verification on how project progress tracking should be implemented

### Mar 20, 2026

Meeting lasted **15 minutes**.

- Further verification on how project progress tracking should be implemented

### Mar 22, 2026

Meeting lasted **19 minutes**.

- Progress update

### Mar 25, 2026

Meeting lasted **28 minutes**.

- Verified updates, and got started on presentation slides

### Mar 27, 2026

Meeting lasted **37 minutes**.

- Verified clock in/out functionality

### Mar 28, 2026

Meeting lasted **33 minutes**.

- Verified materials tracking functionality
- Created the 3-layer software architecture sketch

ITR3

Manual End-to-End Customer Tests: Materials Tracking & Inventory Management

Tester: Kabir Amin (218171009)

Setup used for these tests
Manager account in the same org as Worker A and Worker B.
One project called Materials E2E Project.
Three tasks in that project: Materials Task A for Worker A, Materials Task B for Worker A, and Materials Task C for Worker B.
All inventory testing was done on the project's Tasks page, since that is where the inventory UI is in the current build.
In this build, stock is deducted when the manager clicks Attach, not when a task is marked complete.

Add, update, remove material quantities

Test A
Log in as manager and open Projects, then Materials E2E Project, then Tasks.
In Inventory, add Copper Pipe with unit m and quantity 50.
Confirm the row shows 50 m and status In stock.
Edit the same row and change it to 12 ft.
Refresh the page.
Expected result: the material is added successfully and the edited values stay saved after refresh.

Test B
Add Empty Box with unit box and quantity 0.
Confirm it appears as Depleted.
Add another material called Temporary Material with quantity 3.
Remove Temporary Material and accept the confirmation dialog.
Refresh the page.
Expected result: Empty Box stays in the table with 0 box and Depleted, and Temporary Material is gone after refresh.

Attach materials to tasks

Test A
Add PVC Pipe with quantity 25 pcs to project inventory.
On Materials Task A, choose PVC Pipe, enter 5, and click Attach.
Refresh the page.
Expected result: the task shows PVC Pipe with 5 pcs under Task Materials, and the attachment is still there after refresh.

Test B
On Materials Task A, try attaching PVC Pipe again.
On Materials Task C, click Attach once with no material selected.
Then select a material but enter 0 for quantity and click Attach again.
Expected result: duplicate attach is blocked, empty selection is blocked, and zero quantity is blocked.

Automatic materials deduction

Test A
Add Wire with 50 ft in inventory.
Attach 10 ft of Wire to Materials Task A.
Check the inventory row right away, then refresh.
Expected result: stock drops from 50 ft to 40 ft, and it still shows 40 ft after refresh.

Test B
Add Outlet Plate with 3 pcs.
Attach 2 pcs to Materials Task A.
Try attaching 2 pcs of the same material to Materials Task B.
Then add Switch with 4 unit and attach all 4 to Materials Task C.
Expected result: Outlet Plate drops to 1 pcs after the first attach, the second attach is blocked for low stock, and Switch drops to 0 unit and becomes Depleted.

Task-level material visibility for workers

Test A
As manager, create a task for Worker A.
Attach Conduit with 6 m to that task.
Sign out and log in as Worker A.
Open Dashboard.
Expected result: the task appears under My Assignments and the material chip shows Conduit: 6 m.

Test B
Create one task for Worker A with no materials.
Create another task for Worker B and attach a material to it.
Log in as Worker A and open Dashboard.
Expected result: Worker A sees the no-material task with No materials attached and does not see Worker B's task or its materials.

Test C
As manager, create one task for Worker A.
Attach four different materials to that task.
Log in as Worker A and open Dashboard.
Expected result: the task card shows three material chips and +1 more.
