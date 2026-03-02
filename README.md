## Deliverables

[Link to Jira Board](https://khalifihabdulrazaq.atlassian.net/jira/software/projects/CFLOW/boards/2)

### ITR0

[Planning Document.pdf](deliverables/Planning%20Document.pdf) is in the `deliverables` folder.  
Customer meeting’s summary video: https://youtu.be/ytbclsm6Geg [![YouTube](https://img.shields.io/badge/YouTube-FF0000?logo=youtube&logoColor=white)](https://youtu.be/ytbclsm6Geg)

### ITR1

[log.md](deliverables/log.md) is in the `deliverables` folder.  

"Planning Document.pdf" has been revised. New document is in the `deliverables` folder titled [PlanningDocument-UpdatedMarch1.pdf](deliverables/PlanningDocument-UpdatedMarch1.pdf).   
Change made:  
Blueprint is used as a helper for the tasks assigned, rather than it serving as the main workspace. Our customer suggested using the blueprint feature as an addition to assigning tasks to promote better organization and clarity. Having the blueprint as the main workspace would cause confusion for the workers.

---

# ConstructFlow

A work management system for plumbing and electrical work in construction.

## How to run

To run the app locally:
```bash
cd constructflow
```

Then follow the directions in [constructflow/README.md](constructflow/README.md).

## Features

- **Role-based dashboards** - Distinct interfaces for managers and workers
- **Worker management** - Manage crew members and assign them to tasks
- **Blueprint handling** - Upload and view construction blueprints with section assignments
- **Task assignment** - Assign specific work to workers
- **Real-time authentication** - User sign-up and login with email/password

## Tech Stack

- **Languages:** JavaScript, HTML, CSS
- **Frontend:** React
- **Build tool:** Vite
- **Backend Services:** Firebase
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth

## Repository Structure

A more detailed repository structure is in the project's GitHub Wiki.

```
project-group-9-constructflow/
├── constructflow/              # Main application (React/Vite)
├── deliverables/               # Submission documents for the iterations
└── README.md                   # Project overview
```