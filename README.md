<p align="center">
    <img src="https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/TS-Logo-black-no-bg.svg" width=120 align="center" alt="ThoughtSpot" />
</p>

![test!](https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/TS%20Github%20Repository.png)

<br/>

# Custom Charts (BYOC) – Deployment Guide

You can now use custom charts in ThoughtSpot. To deploy custom charts in ThoughtSpot, please follow the below steps:

## Access the Code

Access the code from the [ThoughtSpot GitHub repository](https://github.com/thoughtspot/ts-chart-sdk).

Click on `kpi_comparison_chart`.

## Download the Necessary Files

Download the following files:
- `index.html`
- `main.js`
- `manifest.json`
- `package.json`
- `style.css`

## Create a Repository on CVS GitHub

Create a repository on CVS GitHub named `your_repository_name`.

## Deploying the Code

You can host the code on a server to make it available for use. To deploy your charts, you can use Vercel, Netlify, or any server that can render an HTML page.

### Example: Deploy on Vercel

1. Navigate to the [Vercel application](https://vercel.com/).
2. Click on **Start Deploying**.

    ![Start Deploying](https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/start-deploying.png)

3. To deploy a new project, import an existing Git repository. Select **Continue with GitHub**.

    ![Continue with GitHub](https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/continue-with-github.png)

4. Provide your GitHub login credentials to continue to Vercel using your GitHub account.
5. After logging in to Vercel using your GitHub account, select the correct repository that has the JavaScript code and import the repository.
6. Configure the project and deploy the code.

Once the code is deployed, Vercel will provide a URL where your service is hosted. Visit this URL to ensure your application is running as expected.

## Using the URL to Set Up Custom Chart in ThoughtSpot

1. Ensure that Custom Charts is enabled on your cluster.
2. Navigate to the **Admin Page** on your ThoughtSpot cluster.
3. Click on **Chart Customisation → Custom Charts → Add Chart**.

    ![Add Chart](https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/add-chart.png)

4. In the pop-up, fill in the required information:
    - **Name**: Name of the Custom Chart
    - **Description** (optional)
    - **Application URL**: URL obtained after deploying in Vercel
    - **Icon URL** (optional): Icon image for the Custom Chart
    - **Author Name** (optional)
    - **Author Email** (optional)
    - **Author Organization** (optional)

5. Click **Add Chart**.
   
Your new chart will appear on the Custom Charts page and will be available for use when creating a chart in ThoughtSpot.
